// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {LendingPool} from "./LendingPool.sol";
import {CollateralVault} from "./CollateralVault.sol";
import {MockPriceOracle} from "../mocks/MockPriceOracle.sol";
import {InterestMath} from "../libraries/InterestMath.sol";
import {PositionRegistry} from "../tokenization/PositionRegistry.sol";

interface ILoanNFT {
    function mintLoan(
        address borrower,
        uint256 principalUsdc,
        uint256 collateralEth,
        uint256 borrowRateBps
    ) external returns (uint256);

    function burnLoan(uint256 tokenId) external;
}

interface ISwapEngine {
    function closeSwapByLoan(uint256 loanTokenId) external;
}

contract LoanManager is Ownable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;

    // Initial borrowing LTV = 75%
    uint256 public constant COLLATERAL_FACTOR_BPS = 7500;

    // Liquidate when LTV exceeds 80%.
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8000;

    // Liquidator receives 5% bonus on collateral.
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;

    LendingPool public immutable lendingPool;
    CollateralVault public immutable collateralVault;
    MockPriceOracle public immutable priceOracle;
    IERC20 public immutable usdc;

    ILoanNFT public loanNFT;
    PositionRegistry public positionRegistry;
    ISwapEngine public swapEngine;

    address public liquidationEngine;

    struct Loan {
        uint256 collateralEth;
        uint256 principalUsdc;
        uint256 borrowRateBps;
        uint256 startTime;
        uint256 tokenId;
        bool active;
    }

    mapping(address => Loan) public loans;

    // Loan NFT tokenId => borrower
    mapping(uint256 => address) public loanBorrower;

    event LoanOpened(
        address indexed borrower,
        uint256 collateralEth,
        uint256 principalUsdc,
        uint256 borrowRateBps,
        uint256 tokenId
    );

    event LoanRepaid(
        address indexed borrower,
        uint256 principal,
        uint256 interest,
        uint256 collateralReturned,
        uint256 tokenId
    );

    event LoanLiquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 indexed tokenId,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 collateralBonus
    );

    event LoanNFTUpdated(address indexed loanNFT);
    event PositionRegistryUpdated(address indexed registry);
    event SwapEngineUpdated(address indexed swapEngine);
    event LiquidationEngineUpdated(address indexed engine);

    error LoanAlreadyExists();
    error NoActiveLoan();
    error ZeroCollateral();
    error ZeroBorrow();
    error ExceedsBorrowLimit();
    error UnauthorizedLiquidationEngine();
    error LoanHealthy();
    error InvalidAddress();
    error InsufficientLiquidatorFunds();

    constructor(
        address lendingPoolAddress,
        address collateralVaultAddress,
        address priceOracleAddress,
        address usdcAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        lendingPool = LendingPool(lendingPoolAddress);
        collateralVault = CollateralVault(collateralVaultAddress);
        priceOracle = MockPriceOracle(priceOracleAddress);
        usdc = IERC20(usdcAddress);
    }

    // --------------------------------------------------
    // Configuration
    // --------------------------------------------------

    function setLoanNFT(address loanNFTAddress)
        external
        onlyOwner
    {
        if (loanNFTAddress == address(0)) {
            revert InvalidAddress();
        }

        loanNFT = ILoanNFT(loanNFTAddress);

        emit LoanNFTUpdated(loanNFTAddress);
    }

    function setPositionRegistry(address registry)
        external
        onlyOwner
    {
        if (registry == address(0)) {
            revert InvalidAddress();
        }

        positionRegistry = PositionRegistry(registry);

        emit PositionRegistryUpdated(registry);
    }

    function setSwapEngine(address engine)
        external
        onlyOwner
    {
        if (engine == address(0)) {
            revert InvalidAddress();
        }

        swapEngine = ISwapEngine(engine);

        emit SwapEngineUpdated(engine);
    }

    function setLiquidationEngine(address engine)
        external
        onlyOwner
    {
        if (engine == address(0)) {
            revert InvalidAddress();
        }

        liquidationEngine = engine;

        emit LiquidationEngineUpdated(engine);
    }

    modifier onlyLiquidationEngine() {
        if (msg.sender != liquidationEngine) {
            revert UnauthorizedLiquidationEngine();
        }
        _;
    }

    // --------------------------------------------------
    // Borrowing
    // --------------------------------------------------

    function borrow(
        uint256 borrowAmountUsdc
    )
        external
        payable
        nonReentrant
    {
        if (loans[msg.sender].active) {
            revert LoanAlreadyExists();
        }

        if (msg.value == 0) {
            revert ZeroCollateral();
        }

        if (borrowAmountUsdc == 0) {
            revert ZeroBorrow();
        }

        uint256 maxBorrowUsdc =
            maxBorrowable(msg.value);

        if (borrowAmountUsdc > maxBorrowUsdc) {
            revert ExceedsBorrowLimit();
        }

        uint256 rate =
            lendingPool.currentBorrowRateBps();

        // Deposit ETH into vault.
        collateralVault.depositFor{
            value: msg.value
        }(msg.sender);

        // Issue USDC.
        lendingPool.issueLoan(
            msg.sender,
            borrowAmountUsdc
        );

        uint256 tokenId = 0;

        if (address(loanNFT) != address(0)) {
            tokenId = loanNFT.mintLoan(
                msg.sender,
                borrowAmountUsdc,
                msg.value,
                rate
            );

            loanBorrower[tokenId] = msg.sender;
        }

        loans[msg.sender] = Loan({
            collateralEth: msg.value,
            principalUsdc: borrowAmountUsdc,
            borrowRateBps: rate,
            startTime: block.timestamp,
            tokenId: tokenId,
            active: true
        });

        emit LoanOpened(
            msg.sender,
            msg.value,
            borrowAmountUsdc,
            rate,
            tokenId
        );
    }

    // --------------------------------------------------
    // Repayment
    // --------------------------------------------------

    function repay()
        external
        nonReentrant
    {
        Loan storage loan = loans[msg.sender];

        if (!loan.active) {
            revert NoActiveLoan();
        }

        uint256 interest =
            InterestMath.calculateInterest(
                loan.principalUsdc,
                loan.borrowRateBps,
                loan.startTime,
                block.timestamp
            );

        uint256 totalRepayment =
            loan.principalUsdc + interest;

        require(
            usdc.transferFrom(
                msg.sender,
                address(this),
                totalRepayment
            ),
            "Transfer failed"
        );

        usdc.approve(
            address(lendingPool),
            totalRepayment
        );

        lendingPool.receiveRepayment(
            address(this),
            msg.sender,
            loan.principalUsdc,
            interest
        );

        // Close hedge if one exists.
        if (
            loan.tokenId != 0 &&
            address(positionRegistry) != address(0) &&
            address(swapEngine) != address(0) &&
            positionRegistry.hasActiveHedge(
                loan.tokenId
            )
        ) {
            swapEngine.closeSwapByLoan(
                loan.tokenId
            );
        }

        uint256 collateral =
            loan.collateralEth;

        uint256 tokenId =
            loan.tokenId;

        collateralVault.withdrawTo(
            msg.sender,
            collateral
        );

        if (
            tokenId != 0 &&
            address(loanNFT) != address(0)
        ) {
            loanNFT.burnLoan(tokenId);
            delete loanBorrower[tokenId];
        }

        emit LoanRepaid(
            msg.sender,
            loan.principalUsdc,
            interest,
            collateral,
            tokenId
        );

        delete loans[msg.sender];
    }

    // --------------------------------------------------
    // Liquidation
    // --------------------------------------------------

    /**
     * @notice Liquidate an unhealthy loan.
     *
     * The liquidator pays the outstanding debt in USDC.
     * The liquidator receives the ETH collateral plus the
     * liquidation bonus.
     */
    function liquidate(
        uint256 tokenId,
        address liquidator
    )
        external
        onlyLiquidationEngine
        nonReentrant
    {
        address borrower =
            loanBorrower[tokenId];

        if (borrower == address(0)) {
            revert NoActiveLoan();
        }

        Loan storage loan =
            loans[borrower];

        if (!loan.active) {
            revert NoActiveLoan();
        }

        // Verify the loan is actually unhealthy.
        if (healthFactorBps(borrower) >= BPS) {
            revert LoanHealthy();
        }

        uint256 interest =
            InterestMath.calculateInterest(
                loan.principalUsdc,
                loan.borrowRateBps,
                loan.startTime,
                block.timestamp
            );

        uint256 debt =
            loan.principalUsdc + interest;

        // Liquidator must approve LoanManager first.
        uint256 liquidatorBalance =
            usdc.balanceOf(liquidator);

        if (liquidatorBalance < debt) {
            revert InsufficientLiquidatorFunds();
        }

        require(
            usdc.transferFrom(
                liquidator,
                address(this),
                debt
            ),
            "Liquidator payment failed"
        );

        usdc.approve(
            address(lendingPool),
            debt
        );

        lendingPool.receiveRepayment(
            address(this),
            borrower,
            loan.principalUsdc,
            interest
        );

        // Close hedge if present.
        if (
            loan.tokenId != 0 &&
            address(positionRegistry) != address(0) &&
            address(swapEngine) != address(0) &&
            positionRegistry.hasActiveHedge(
                loan.tokenId
            )
        ) {
            swapEngine.closeSwapByLoan(
                loan.tokenId
            );
        }

        uint256 collateral =
            loan.collateralEth;

        uint256 bonus =
            (
                collateral *
                LIQUIDATION_BONUS_BPS
            ) / BPS;

        uint256 collateralToLiquidator =
            collateral + bonus;

        // Never allow bonus to exceed vault collateral.
        if (
            collateralToLiquidator >
            collateral
        ) {
            collateralToLiquidator = collateral;
        }

        collateralVault.withdrawTo(
            liquidator,
            collateralToLiquidator
        );

        if (
            loan.tokenId != 0 &&
            address(loanNFT) != address(0)
        ) {
            loanNFT.burnLoan(
                loan.tokenId
            );

            delete loanBorrower[
                loan.tokenId
            ];
        }

        emit LoanLiquidated(
            borrower,
            liquidator,
            tokenId,
            debt,
            collateralToLiquidator,
            bonus
        );

        delete loans[borrower];
    }

    // --------------------------------------------------
    // Risk / Views
    // --------------------------------------------------

    function collateralValueUsdc(
        address borrower
    )
        public
        view
        returns (uint256)
    {
        Loan memory loan =
            loans[borrower];

        uint256 ethPrice =
            priceOracle.getEthPrice();

        // ETH: 18 decimals
        // price: 8 decimals
        // result: USD 8 decimals
        uint256 collateralValueUsd =
            (
                loan.collateralEth *
                ethPrice
            ) / 1e18;

        // USD 8 decimals -> USDC 6 decimals
        return collateralValueUsd / 100;
    }

    function debtOf(
        address borrower
    )
        public
        view
        returns (uint256)
    {
        Loan memory loan =
            loans[borrower];

        if (!loan.active) {
            return 0;
        }

        uint256 interest =
            InterestMath.calculateInterest(
                loan.principalUsdc,
                loan.borrowRateBps,
                loan.startTime,
                block.timestamp
            );

        return loan.principalUsdc + interest;
    }

    /**
     * @notice Returns LTV in basis points.
     *
     * 7500 = 75% LTV
     * 8000 = 80% LTV
     */
    function ltvBps(
        address borrower
    )
        public
        view
        returns (uint256)
    {
        uint256 debt =
            debtOf(borrower);

        uint256 collateral =
            collateralValueUsdc(
                borrower
            );

        if (collateral == 0) {
            return type(uint256).max;
        }

        return
            (debt * BPS) /
            collateral;
    }

    /**
     * @notice Health factor expressed in BPS.
     *
     * >= 10000 = healthy
     * < 10000 = liquidatable
     */
    function healthFactorBps(
        address borrower
    )
        public
        view
        returns (uint256)
    {
        uint256 debt =
            debtOf(borrower);

        if (debt == 0) {
            return type(uint256).max;
        }

        uint256 collateral =
            collateralValueUsdc(
                borrower
            );

        return
            (
                collateral *
                LIQUIDATION_THRESHOLD_BPS
            ) / debt;
    }

    function maxBorrowable(
        uint256 collateralEth
    )
        public
        view
        returns (uint256)
    {
        uint256 ethPrice =
            priceOracle.getEthPrice();

        uint256 collateralValueUsd =
            (
                collateralEth *
                ethPrice
            ) / 1e18;

        return
            (
                collateralValueUsd *
                COLLATERAL_FACTOR_BPS
            ) / BPS / 100;
    }

    function hasActiveLoan(
        address borrower
    )
        external
        view
        returns (bool)
    {
        return loans[borrower].active;
    }

    function getLoanByTokenId(
        uint256 tokenId
    )
        external
        view
        returns (
            address borrower,
            Loan memory loan
        )
    {
        borrower = loanBorrower[tokenId];
        loan = loans[borrower];
    }

    function isLiquidatable(
        uint256 tokenId
    )
        external
        view
        returns (bool)
    {
        address borrower =
            loanBorrower[tokenId];

        if (borrower == address(0)) {
            return false;
        }

        return
            healthFactorBps(borrower)
            < BPS;
    }
}