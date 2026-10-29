package com.archflux.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.FactoryBean;
import org.springframework.boot.orm.jpa.EntityManagerFactoryBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import com.archflux.service.SchemaReadinessService;
import jakarta.persistence.EntityManagerFactory;

/**
 * Replaces Boot's eager {@code entityManagerFactory} (Boot backs off via
 * {@code @ConditionalOnMissingBean}) with a delegating {@link FactoryBean}
 * that builds the real EMF on FIRST USE instead of at startup.
 *
 * <p>Why: Spring instantiates every {@code LoadTimeWeaverAware} bean during
 * context refresh ({@code AbstractApplicationContext#finishBeanFactoryInitialization}),
 * and {@code LocalContainerEntityManagerFactoryBean} implements that
 * interface — so no lazy flag can ever defer it, and a missing schema would
 * always crash boot. This wrapper is a plain FactoryBean (not
 * LoadTimeWeaverAware), so refresh skips it; the first real DB access builds
 * the delegate with the exact same Boot builder/settings (including
 * {@code ddl-auto: validate}).
 *
 * <p>Failure semantics: the build is guarded by {@link SchemaReadinessService}
 * (500 DB_UNAVAILABLE + migration pointer when tables are absent) and Spring
 * does not cache failed FactoryBean products, so applying the migration later
 * heals the app with NO restart.
 */
@Configuration
public class DeferredEntityManagerFactoryConfiguration {

  @Bean("entityManagerFactory")
  public FactoryBean<EntityManagerFactory> entityManagerFactory(
      EntityManagerFactoryBuilder builder, DataSource dataSource,
      SchemaReadinessService readiness) {
    return new DeferredEntityManagerFactoryBean(builder, dataSource, readiness);
  }

  static final class DeferredEntityManagerFactoryBean
      implements FactoryBean<EntityManagerFactory>, DisposableBean {

    private final EntityManagerFactoryBuilder builder;
    private final DataSource dataSource;
    private final SchemaReadinessService readiness;

    private volatile EntityManagerFactory emf;
    private volatile LocalContainerEntityManagerFactoryBean delegate;

    DeferredEntityManagerFactoryBean(EntityManagerFactoryBuilder builder,
        DataSource dataSource, SchemaReadinessService readiness) {
      this.builder = builder;
      this.dataSource = dataSource;
      this.readiness = readiness;
    }

    @Override
    public synchronized EntityManagerFactory getObject() throws Exception {
      EntityManagerFactory result = emf;
      if (result == null) {
        // Guard first: typed DB_UNAVAILABLE (never a raw Hibernate error),
        // and failures are NOT cached, so a later migration heals the app.
        readiness.requireReady();
        // Same shape as Boot's own EMF: our entities all live in
        // com.archflux.domain; vendor properties (incl. ddl-auto: validate)
        // come from the injected Boot builder.
        LocalContainerEntityManagerFactoryBean factoryBean = builder.dataSource(dataSource)
            .packages("com.archflux.domain")
            .jta(false)
            .build();
        factoryBean.afterPropertiesSet();
        result = factoryBean.getObject();
        if (result == null) {
          throw new IllegalStateException("Failed to build JPA EntityManagerFactory");
        }
        delegate = factoryBean;
        emf = result;
      }
      return result;
    }

    @Override
    public Class<?> getObjectType() {
      return EntityManagerFactory.class;
    }

    @Override
    public boolean isSingleton() {
      return true;
    }

    @Override
    public void destroy() {
      if (delegate != null) {
        delegate.destroy();
      }
    }
  }
}
