package com.archflux.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Phase 2 executors (PRODUCTIZATION_SPEC §10): webhook deliveries are
 * processed asynchronously on a bounded pool — never on the webhook request
 * thread. Also hosts {@code @EnableScheduling} for the hourly idempotency
 * TTL purge (fixedRate 1h; first run is a single cheap DELETE, harmless in
 * tests).
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {

  @Bean("webhookExecutor")
  public ThreadPoolTaskExecutor webhookExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(8);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("wh-");
    executor.setRejectedExecutionHandler(
        new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(30);
    executor.initialize();
    return executor;
  }
}
