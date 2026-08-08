import uvicorn

from app.config.env import get_port, validate_env
from app.main import app


def main() -> None:
    validate_env()
    uvicorn.run("app.main:app", host="0.0.0.0", port=get_port(), reload=False)


if __name__ == "__main__":
    main()
