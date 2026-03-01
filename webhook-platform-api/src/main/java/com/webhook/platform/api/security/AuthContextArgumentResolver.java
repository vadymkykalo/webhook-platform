package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.exception.UnauthorizedException;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

@Component
public class AuthContextArgumentResolver implements HandlerMethodArgumentResolver {

    private final ProjectRepository projectRepository;

    public AuthContextArgumentResolver(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return AuthContext.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        if (auth instanceof JwtAuthenticationToken jwt) {
            return new AuthContext(
                    jwt.getUserId(),
                    jwt.getOrganizationId(),
                    jwt.getRole(),
                    null
            );
        }

        if (auth instanceof ApiKeyAuthenticationToken apiKey) {
            Project project = projectRepository.findById(apiKey.getProjectId())
                    .orElseThrow(() -> new UnauthorizedException("Invalid API key: project not found"));

            return new AuthContext(
                    null,
                    project.getOrganizationId(),
                    MembershipRole.API_KEY,
                    apiKey.getProjectId()
            );
        }

        throw new UnauthorizedException("Authentication required");
    }
}
