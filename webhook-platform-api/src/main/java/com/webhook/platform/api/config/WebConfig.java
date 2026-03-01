package com.webhook.platform.api.config;

import com.webhook.platform.api.security.AuthContextArgumentResolver;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthContextArgumentResolver authContextArgumentResolver;

    public WebConfig(AuthContextArgumentResolver authContextArgumentResolver) {
        this.authContextArgumentResolver = authContextArgumentResolver;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(authContextArgumentResolver);
    }
}
