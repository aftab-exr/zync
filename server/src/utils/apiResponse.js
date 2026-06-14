// utils/apiResponse.js
class apiResponse {
    constructor(statusCode, message = "Success", data) {
        this.statusCode = statusCode;
        this.message = message;
        this.data = data;
        this.success = statusCode < 400;
        if (statusCode >= 400) {
            this.error = message;
        }
    }
}

export default apiResponse;