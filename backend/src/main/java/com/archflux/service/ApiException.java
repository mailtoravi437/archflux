package com.archflux.service;

/** Typed application error mapped to {"error":{"code","message"}} by ApiExceptionHandler. */
public class ApiException extends RuntimeException {

  private final String code;
  private final int status;
  private final java.util.Map<String, Object> extra;

  public ApiException(String code, int status, String message) {
    this(code, status, message, java.util.Map.of());
  }

  public ApiException(String code, int status, String message, java.util.Map<String, Object> extra) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra == null ? java.util.Map.of() : extra;
  }

  /** Extra fields merged into the {@code error} object (e.g. limit, current, max). */
  public java.util.Map<String, Object> extra() {
    return extra;
  }

  public String code() {
    return code;
  }

  public int status() {
    return status;
  }

  public static ApiException notFound(String message) {
    return new ApiException("NOT_FOUND", 404, message);
  }

  public static ApiException forbidden(String message) {
    return new ApiException("FORBIDDEN", 403, message);
  }

  public static ApiException validation(String message) {
    return new ApiException("VALIDATION_ERROR", 400, message);
  }

  public static ApiException conflict(String code, String message) {
    return new ApiException(code, 409, message);
  }

  public static ApiException versionConflict(long expected, long current) {
    return new ApiException("VERSION_CONFLICT", 409,
        "Diagram changed since version " + expected + " (current " + current + "). Reload and retry.");
  }

  public static ApiException unprocessable(String message) {
    return new ApiException("UNPROCESSABLE_ENTITY", 422, message);
  }

  /** 422 with a specific machine code (e.g. TITLE_MISMATCH). */
  public static ApiException unprocessable(String code, String message) {
    return new ApiException(code, 422, message);
  }

  /** 402 over a plan limit (DATA_MODEL_R1 §4.4): {"error":{"code":"LIMIT_REACHED","limit","current","max"}}. */
  public static ApiException limitReached(String limit, int current, int max) {
    java.util.Map<String, Object> extra = new java.util.LinkedHashMap<>();
    extra.put("limit", limit);
    extra.put("current", current);
    extra.put("max", max);
    return new ApiException("LIMIT_REACHED", 402,
        "Plan limit reached for " + limit + " (" + current + "/" + max + ")", extra);
  }

  public static ApiException dbUnavailable() {
    return new ApiException("DB_UNAVAILABLE", 500,
        "Database unavailable — apply db/migrations/V1__init.sql with psql, then retry.");
  }
}
