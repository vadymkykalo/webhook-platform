package com.webhook.platform.api.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;

@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgumentException(
            IllegalArgumentException ex, WebRequest request) {
        log.error("Bad request: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "invalid_request",
                ex.getMessage(),
                HttpStatus.BAD_REQUEST.value()
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntimeException(
            RuntimeException ex, WebRequest request) {
        
        if (ex.getMessage() != null && ex.getMessage().contains("Authentication required")) {
            log.error("Unauthorized: {}", ex.getMessage());
            ErrorResponse error = new ErrorResponse(
                    "unauthorized",
                    "Authentication required",
                    HttpStatus.UNAUTHORIZED.value()
            );
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
        }
        
        if (ex.getMessage() != null && ex.getMessage().contains("Insufficient permissions")) {
            log.error("Forbidden: {}", ex.getMessage());
            ErrorResponse error = new ErrorResponse(
                    "forbidden",
                    "Insufficient permissions",
                    HttpStatus.FORBIDDEN.value()
            );
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
        }
        
        if (ex.getMessage() != null && ex.getMessage().contains("not found")) {
            log.error("Not found: {}", ex.getMessage());
            ErrorResponse error = new ErrorResponse(
                    "not_found",
                    ex.getMessage(),
                    HttpStatus.NOT_FOUND.value()
            );
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        }
        
        log.error("Internal server error: {}", ex.getMessage(), ex);
        ErrorResponse error = new ErrorResponse(
                "internal_error",
                "An unexpected error occurred",
                HttpStatus.INTERNAL_SERVER_ERROR.value()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(
            Exception ex, WebRequest request) {
        log.error("Unexpected error: {}", ex.getMessage(), ex);
        ErrorResponse error = new ErrorResponse(
                "internal_error",
                "An unexpected error occurred",
                HttpStatus.INTERNAL_SERVER_ERROR.value()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
