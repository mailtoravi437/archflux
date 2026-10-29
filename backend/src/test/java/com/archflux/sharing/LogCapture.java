package com.archflux.sharing;

import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.LoggerFactory;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** Captures every log event on the root logger (all levels the config emits). */
final class LogCapture implements AutoCloseable {

  private final Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
  private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

  LogCapture() {
    appender.start();
    root.addAppender(appender);
  }

  List<ILoggingEvent> events() {
    return List.copyOf(appender.list);
  }

  /** Formatted messages plus raw arguments, MDC and throwable text: everything a log line can carry. */
  String everything() {
    return events().stream().map(e -> {
      StringBuilder out = new StringBuilder(e.getFormattedMessage());
      if (e.getArgumentArray() != null) {
        for (Object arg : e.getArgumentArray()) {
          out.append(' ').append(arg);
        }
      }
      out.append(' ').append(e.getMDCPropertyMap());
      if (e.getThrowableProxy() != null) {
        out.append(' ').append(e.getThrowableProxy().getMessage());
      }
      return out.toString();
    }).collect(Collectors.joining("\n"));
  }

  @Override
  public void close() {
    root.detachAppender(appender);
    appender.stop();
  }
}
