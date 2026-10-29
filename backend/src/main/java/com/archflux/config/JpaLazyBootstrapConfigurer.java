package com.archflux.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Belt and braces for degraded boot: force lazy initialization on the JPA
 * bootstrap beans so a missing schema/DB can never fail startup. All DB
 * access is guarded by SchemaReadinessService, so the EMF is only ever built
 * on first real use against a ready schema.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class JpaLazyBootstrapConfigurer
    implements BeanDefinitionRegistryPostProcessor {

  private static final String[] LAZY_BEANS = { "entityManagerFactory", "transactionManager" };

  @Override
  public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
    for (String name : LAZY_BEANS) {
      if (registry.containsBeanDefinition(name)) {
        registry.getBeanDefinition(name).setLazyInit(true);
      }
    }
  }

  @Override
  public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
    for (String name : LAZY_BEANS) {
      if (beanFactory.containsBeanDefinition(name)) {
        beanFactory.getBeanDefinition(name).setLazyInit(true);
      }
    }
    for (String name : beanFactory.getBeanDefinitionNames()) {
      BeanDefinition definition = beanFactory.getBeanDefinition(name);
      String className = definition.getBeanClassName();
      if (className != null && className.toLowerCase().contains("jparepositoryfactorybean")) {
        definition.setLazyInit(true);
      }
    }
    for (String name : beanFactory.getBeanDefinitionNames()) {
      String lower = name.toLowerCase();
      if (lower.endsWith("repository") || lower.equals("entitymanagerfactory")
          || lower.equals("transactionmanager")) {
        BeanDefinition definition = beanFactory.getBeanDefinition(name);
        definition.setLazyInit(true);
      }
    }
  }
}
