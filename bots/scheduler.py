from apscheduler.schedulers.blocking import BlockingScheduler


def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.start()


if __name__ == "__main__":
    main()
