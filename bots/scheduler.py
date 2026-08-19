import os
import signal
import subprocess
import sys
import time

from config import POLL_INTERVAL


# ============================================================
# KEEPERS
# ============================================================

KEEPERS = [
    "oracle_keeper.py",
    "settlement_keeper.py",
    "liquidation_keeper.py",
]


# ============================================================
# PROCESS MANAGEMENT
# ============================================================

def start_keeper(script):

    print(
        f"[SCHEDULER] Starting "
        f"{script}"
    )

    # -u = unbuffered Python output
    # This makes keeper logs appear immediately.
    return subprocess.Popen(
        [
            sys.executable,
            "-u",
            script,
        ],
        cwd=os.path.dirname(
            os.path.abspath(__file__)
        ),
    )


def stop_keeper(
    script,
    process,
):

    if process.poll() is not None:

        return

    print(
        f"[SCHEDULER] Stopping "
        f"{script}"
    )

    try:

        process.terminate()

        process.wait(
            timeout=10
        )

    except subprocess.TimeoutExpired:

        print(
            f"[SCHEDULER] "
            f"{script} did not stop. "
            f"Killing..."
        )

        process.kill()

        process.wait()


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 60)
    print("              HedgeFi Keeper Scheduler")
    print("=" * 60)

    print(
        f"Poll interval: "
        f"{POLL_INTERVAL}s"
    )

    print(
        "Keepers:"
    )

    for keeper in KEEPERS:

        print(
            f"  - {keeper}"
        )

    print("=" * 60)

    # --------------------------------------------------------
    # Start all keepers
    # --------------------------------------------------------

    processes = {}

    for keeper in KEEPERS:

        processes[keeper] = (
            start_keeper(keeper)
        )

    print(
        "[SCHEDULER] All keepers started."
    )

    print("=" * 60)

    # --------------------------------------------------------
    # Supervisor loop
    # --------------------------------------------------------

    try:

        while True:

            for keeper in KEEPERS:

                process = processes.get(
                    keeper
                )

                if process is None:
                    continue

                return_code = (
                    process.poll()
                )

                # ------------------------------------------------
                # Keeper still alive
                # ------------------------------------------------

                if return_code is None:

                    continue

                # ------------------------------------------------
                # Keeper died
                # ------------------------------------------------

                print(
                    f"\n[SCHEDULER] "
                    f"{keeper} exited "
                    f"with code "
                    f"{return_code}"
                )

                print(
                    f"[SCHEDULER] "
                    f"Restarting {keeper}..."
                )

                processes[keeper] = (
                    start_keeper(
                        keeper
                    )
                )

            time.sleep(
                POLL_INTERVAL
            )

    # --------------------------------------------------------
    # Ctrl+C
    # --------------------------------------------------------

    except KeyboardInterrupt:

        print(
            "\n"
            + "=" * 60
        )

        print(
            "[SCHEDULER] "
            "Shutdown requested."
        )

        print("=" * 60)

        for keeper in KEEPERS:

            process = processes.get(
                keeper
            )

            if process is not None:

                stop_keeper(
                    keeper,
                    process,
                )

        print(
            "[SCHEDULER] "
            "Shutdown complete."
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()