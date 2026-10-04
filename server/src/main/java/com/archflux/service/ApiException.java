package com.archflux.service;

/** Typed application error mapped to {"error":{"code","message"}} by ApiExceptionHandler. */
public class ApiException extends RuntimeException {

  private final String code;
  private final int status;

  public ApiException(String code, int status, String message) {
    super(message);
    this.code = code;
    this.status = status;
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

  public static ApiException dbUnavailable() {
    return new ApiException("DB_UNAVAILABLE", 500,
        "Database unavailable — apply db/migrations/V1__init.sql with psql, then retry.");
  }
}
