import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const MAX_PERSON_NAME = 40;
export function asBody(value, label = "The request body") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new HttpError(400, `${label} must be a JSON object`);
    }
    return value;
}
export function toObjectId(value, label = "id") {
    if (typeof value !== "string" || !OBJECT_ID_PATTERN.test(value)) {
        throw new HttpError(400, `Invalid ${label}: ${String(value)}`);
    }
    return new ObjectId(value);
}
export function requireString(body, field, maxLength) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
        throw new HttpError(400, `${field} is required`);
    }
    if (value.trim().length > maxLength) {
        throw new HttpError(400, `${field} must be at most ${maxLength} characters`);
    }
    return value.trim();
}
export function optionalString(body, field, maxLength) {
    const value = body[field];
    if (value === undefined || value === null || value === "")
        return undefined;
    return requireString(body, field, maxLength);
}
export function requireInteger(body, field, min, max) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
    }
    return value;
}
export function requireNumber(body, field, min, max) {
    const value = body[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new HttpError(400, `${field} must be a number between ${min} and ${max}`);
    }
    return value;
}
export function optionalBoolean(body, field) {
    const value = body[field];
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "boolean")
        throw new HttpError(400, `${field} must be true or false`);
    return value;
}
export function requireOneOf(body, field, allowed) {
    const value = body[field];
    const match = allowed.find((option) => option === value);
    if (match === undefined)
        throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}`);
    return match;
}
export function requireSubset(body, field, allowed) {
    const value = body[field] ?? [];
    if (!Array.isArray(value))
        throw new HttpError(400, `${field} must be a list`);
    const result = value.map((item) => {
        const match = allowed.find((option) => option === item);
        if (match === undefined)
            throw new HttpError(400, `${field} can only contain: ${allowed.join(", ")}`);
        return match;
    });
    return [...new Set(result)];
}
export function personName(body, field, fallback) {
    return optionalString(body, field, MAX_PERSON_NAME) ?? fallback;
}
