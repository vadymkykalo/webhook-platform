package com.webhook.platform.cli.command;

import com.webhook.platform.cli.config.CliConfig;
import com.webhook.platform.cli.config.CliConfigService;
import picocli.CommandLine.Command;
import picocli.CommandLine.Parameters;

import java.io.PrintStream;
import java.util.concurrent.Callable;

@Command(
        name = "config",
        description = "View or update CLI configuration",
        mixinStandardHelpOptions = true,
        subcommands = {
                ConfigCommand.ShowSubcommand.class,
                ConfigCommand.SetSubcommand.class,
                ConfigCommand.ClearSubcommand.class
        }
)
public class ConfigCommand implements Callable<Integer> {

    @Override
    public Integer call() throws Exception {
        return new ShowSubcommand().call();
    }

    @Command(name = "show", description = "Show current configuration", mixinStandardHelpOptions = true)
    public static class ShowSubcommand implements Callable<Integer> {

        private final PrintStream out = System.out;

        @Override
        public Integer call() throws Exception {
            CliConfigService configService = new CliConfigService();
            CliConfig config = configService.load();

            out.println("Hookflow CLI Configuration");
            out.println("══════════════════════════════════════");
            out.println("  File:        " + configService.getConfigPath());
            out.println("  Backend URL: " + config.getBackendUrl());
            out.println("  Auth:        " + (config.isAuthenticated() ? "✓ authenticated" : "✗ not authenticated"));
            if (config.getAccessToken() != null) {
                out.println("  Token:       " + config.getAccessToken().substring(0, Math.min(20, config.getAccessToken().length())) + "…");
            }
            if (config.getUserId() != null) out.println("  User ID:     " + config.getUserId());
            if (config.getOrganizationId() != null) out.println("  Org ID:      " + config.getOrganizationId());
            if (config.getActiveProjectId() != null) out.println("  Project ID:  " + config.getActiveProjectId());
            return 0;
        }
    }

    @Command(name = "set", description = "Set a configuration value", mixinStandardHelpOptions = true)
    public static class SetSubcommand implements Callable<Integer> {

        @Parameters(index = "0", description = "Key to set (backend-url, project-id)")
        private String key;

        @Parameters(index = "1", description = "Value to set")
        private String value;

        private final PrintStream out = System.out;
        private final PrintStream err = System.err;

        @Override
        public Integer call() throws Exception {
            CliConfigService configService = new CliConfigService();
            CliConfig config = configService.load();

            switch (key) {
                case "backend-url" -> config.setBackendUrl(value);
                case "project-id" -> config.setActiveProjectId(value);
                default -> {
                    err.println("✗ Unknown config key: " + key);
                    err.println("  Available keys: backend-url, project-id");
                    return 1;
                }
            }

            configService.save(config);
            out.println("✓ Set " + key + " = " + value);
            return 0;
        }
    }

    @Command(name = "clear", description = "Clear configuration and logout", mixinStandardHelpOptions = true)
    public static class ClearSubcommand implements Callable<Integer> {

        private final PrintStream out = System.out;

        @Override
        public Integer call() throws Exception {
            CliConfigService configService = new CliConfigService();
            configService.clear();
            out.println("✓ Configuration cleared");
            return 0;
        }
    }
}
