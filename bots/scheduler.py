import time
import subprocess
import sys

from config import POLL_INTERVAL


def run_keeper(script):

    return subprocess.Popen(
        [
            sys.executable,
            script
        ]
    )


def main():

    print("=" * 60)
    print("              HedgeFi Keeper Scheduler")
    print("=" * 60)

    print(
        f"Poll interval: {POLL_INTERVAL}s"
    )

    processes = []

    # Oracle
    processes.append(
        run_keeper("oracle_keeper.py")
    )

    # Liquidation
    processes.append(
        run_keeper("liquidation_keeper.py")
    )

    # Existing settlement keeper
    processes.append(
        run_keeper("settlement_keeper.py")
    )

    print(
        "[SCHEDULER] All keepers started"
    )

    try:

        while True:

            for process in processes:

                if process.poll() is not None:

                    print(
                        f"[SCHEDULER] "
                        f"Keeper exited with code "
                        f"{process.returncode}"
                    )

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:

        print(
            "\n[SCHEDULER] Stopping keepers..."
        )

        for process in processes:

            process.terminate()

        for process in processes:

            process.wait()

        print(
            "[SCHEDULER] Shutdown complete"
        )


if __name__ == "__main__":
    main()