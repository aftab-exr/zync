from typing import Any


class ApiResponse:
    def __init__(self, status_code: int, message: str = "Success", data: Any = None):
        self.status_code = status_code
        self.message = message
        self.data = data
        self.success = status_code < 400
        if status_code >= 400:
            self.error = message

    def model_dump(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "statusCode": self.status_code,
            "message": self.message,
            "data": self.data,
            "success": self.success,
        }
        if not self.success:
            payload["error"] = self.message
        return payload
