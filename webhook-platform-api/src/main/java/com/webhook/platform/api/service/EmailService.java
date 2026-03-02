package com.webhook.platform.api.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.email.from:noreply@hookflow.dev}")
    private String fromAddress;

    @Value("${app.base-url:http://localhost:5173}")
    private String baseUrl;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    public EmailService(@Autowired(required = false) JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendVerificationEmail(String to, String token) {
        String verifyUrl = baseUrl + "/verify-email?token=" + token;

        if (!emailEnabled) {
            log.info("========== EMAIL VERIFICATION ==========");
            log.info("To: {}", to);
            log.info("Verify URL: {}", verifyUrl);
            log.info("=========================================");
            return;
        }

        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject("Verify your email — Hookflow");
            helper.setText(buildVerificationHtml(verifyUrl), true);
            mailSender.send(message);
            log.info("Verification email sent to {}", to);
        } catch (Exception e) {
            log.error("Failed to send verification email to {}: {}", to, e.getMessage());
            log.info("Fallback — Verify URL: {}", verifyUrl);
        }
    }

    public void sendPasswordResetEmail(String to, String token) {
        String resetUrl = baseUrl + "/reset-password?token=" + token;

        if (!emailEnabled) {
            log.info("========== PASSWORD RESET ==========");
            log.info("To: {}", to);
            log.info("Reset URL: {}", resetUrl);
            log.info("====================================");
            return;
        }

        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject("Reset your password — Hookflow");
            helper.setText(buildPasswordResetHtml(resetUrl), true);
            mailSender.send(message);
            log.info("Password reset email sent to {}", to);
        } catch (Exception e) {
            log.error("Failed to send password reset email to {}: {}", to, e.getMessage());
            log.info("Fallback — Reset URL: {}", resetUrl);
        }
    }

    public void sendInviteEmail(String to, String orgId, String inviteToken) {
        String inviteUrl = baseUrl + "/accept-invite?token=" + inviteToken + "&orgId=" + orgId;

        if (!emailEnabled) {
            log.info("========== MEMBER INVITE ==========");
            log.info("To: {}", to);
            log.info("Invite URL: {}", inviteUrl);
            log.info("====================================");
            return;
        }

        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject("You've been invited to join an organization — Hookflow");
            helper.setText(buildInviteHtml(inviteUrl), true);
            mailSender.send(message);
            log.info("Invite email sent to {}", to);
        } catch (Exception e) {
            log.error("Failed to send invite email to {}: {}", to, e.getMessage());
            log.info("Fallback — Invite URL: {}", inviteUrl);
        }
    }

    private String buildInviteHtml(String inviteUrl) {
        return """
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <h2 style="color: #111;">You're invited!</h2>
                <p style="color: #555; line-height: 1.5;">
                    You've been invited to join an organization on Hookflow.
                    Click the button below to accept the invitation.
                </p>
                <a href="%s"
                   style="display: inline-block; padding: 12px 24px; background: #111; color: #fff;
                          text-decoration: none; border-radius: 6px; margin: 16px 0;">
                    Accept Invitation
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    This invitation expires in 48 hours. If you didn't expect this, you can safely ignore it.
                </p>
            </div>
            """.formatted(inviteUrl);
    }

    private String buildPasswordResetHtml(String resetUrl) {
        return """
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <h2 style="color: #111;">Reset your password</h2>
                <p style="color: #555; line-height: 1.5;">
                    We received a request to reset the password for your Hookflow account.
                    Click the button below to set a new password.
                </p>
                <a href="%s"
                   style="display: inline-block; padding: 12px 24px; background: #111; color: #fff;
                          text-decoration: none; border-radius: 6px; margin: 16px 0;">
                    Reset Password
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    If you didn't request a password reset, you can safely ignore this email.
                    This link expires in 1 hour.
                </p>
            </div>
            """.formatted(resetUrl);
    }

    private String buildVerificationHtml(String verifyUrl) {
        return """
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <h2 style="color: #111;">Verify your email</h2>
                <p style="color: #555; line-height: 1.5;">
                    Thanks for signing up for Hookflow. Click the button below to verify your email address.
                </p>
                <a href="%s"
                   style="display: inline-block; padding: 12px 24px; background: #111; color: #fff;
                          text-decoration: none; border-radius: 6px; margin: 16px 0;">
                    Verify Email
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    If you didn't create an account, you can safely ignore this email.
                    This link expires in 24 hours.
                </p>
            </div>
            """.formatted(verifyUrl);
    }
}
