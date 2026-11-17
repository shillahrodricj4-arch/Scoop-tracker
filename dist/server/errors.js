import { MongoServerError } from "mongodb";
const DUPLICATE_KEY_CODE = 11000;
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "HttpError";
    }
}
export function isDuplicateKeyError(error) {
    return error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE;
}
export function apiNotFound(req, _res, next) {
    next(new HttpError(404, `No API route for ${req.method} ${req.originalUrl}`));
}
function isBodyParseError(error) {
    return error instanceof SyntaxError && "body" in error;
}
// Express 5 forwards errors thrown in async route handlers to this middleware,
// so the routes themselves do not need try/catch blocks.
export function errorHandler(error, _req, res, _next) {
    if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    if (isBodyParseError(error)) {
        res.status(400).json({ error: "The request body is not valid JSON" });
        return;
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong on the server" });
}
