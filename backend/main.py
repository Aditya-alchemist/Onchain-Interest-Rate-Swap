from fastapi import FastAPI

app = FastAPI(title="HedgeFi API")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "hedgefi-api"}
