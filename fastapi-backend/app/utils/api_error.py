from typing import Any


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str = "An error occurred while processing your request",
        errors: list[Any] | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.success = False
        self.data = None
        self.errors = errors or []
