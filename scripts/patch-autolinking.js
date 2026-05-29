#!/usr/bin/env node
/**
 * Patches expo-modules-autolinking and expo-modules-core to replace internal
 * Gradle APIs (org.gradle.internal.cc.base and org.gradle.internal.extensions.core)
 * with public equivalents, so the Kotlin gradle plugins compile on Gradle 9.x
 * without 'cc'/'logger'/'extra' unresolved reference errors.
 */

const fs = require('fs');
const path = require('path');

const nm = path.join(__dirname, '..', 'node_modules');

const autolinkingGradlePlugin = path.join(
  nm,
  'expo-modules-autolinking',
  'android',
  'expo-gradle-plugin'
);

const expoModulesCorePlugin = path.join(
  nm,
  'expo-modules-core',
  'expo-module-gradle-plugin',
  'src',
  'main',
  'kotlin',
  'expo',
  'modules',
  'plugin'
);

function patch(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-autolinking] Skipping (not found): ${path.basename(filePath)}`);
    return;
  }
  let src = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  let changed = false;
  for (const [from, to] of replacements) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`[patch-autolinking] Patched: ${path.basename(filePath)}`);
  } else {
    console.log(`[patch-autolinking] Already patched or not matched: ${path.basename(filePath)}`);
  }
}

// ── expo-autolinking-settings-plugin ────────────────────────────────────────

const settingsPluginBase = path.join(
  autolinkingGradlePlugin,
  'expo-autolinking-settings-plugin',
  'src', 'main', 'kotlin', 'expo', 'modules', 'plugin'
);

// ExpoAutolinkingSettingsPlugin.kt — replace cc.base.logger with Logging API
patch(path.join(settingsPluginBase, 'ExpoAutolinkingSettingsPlugin.kt'), [
  [
    'import org.gradle.internal.cc.base.logger',
    'import org.gradle.api.logging.Logging',
  ],
  [
    // Anchor disappears after patching (override fun apply is no longer the next line)
    'open class ExpoAutolinkingSettingsPlugin : Plugin<Settings> {\n  override fun apply(settings: Settings) {',
    'open class ExpoAutolinkingSettingsPlugin : Plugin<Settings> {\n  private val logger = Logging.getLogger(ExpoAutolinkingSettingsPlugin::class.java)\n\n  override fun apply(settings: Settings) {',
  ],
]);

// SettingsManager.kt — replace internal extra import with extraProperties
patch(path.join(settingsPluginBase, 'SettingsManager.kt'), [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'project.extra.set("coreFeatures", config.coreFeatures)',
    'project.extensions.extraProperties.set("coreFeatures", config.coreFeatures)',
  ],
]);

// ── expo-max-sdk-override-plugin ─────────────────────────────────────────────

const maxSdkBase = path.join(
  autolinkingGradlePlugin,
  'expo-max-sdk-override-plugin',
  'src', 'main', 'kotlin', 'expo', 'modules', 'plugin'
);

// ExpoMaxSdkOverridePlugin.kt — replace cc.base.logger with Logging API
patch(path.join(maxSdkBase, 'ExpoMaxSdkOverridePlugin.kt'), [
  [
    'import org.gradle.internal.cc.base.logger',
    'import org.gradle.api.logging.Logging',
  ],
  [
    // Anchor disappears after patching
    'class ExpoMaxSdkOverridePlugin : Plugin<Project> {\n  override fun apply(project: Project) {',
    'class ExpoMaxSdkOverridePlugin : Plugin<Project> {\n  private val logger = Logging.getLogger(ExpoMaxSdkOverridePlugin::class.java)\n\n  override fun apply(project: Project) {',
  ],
]);

// FindPermissionsToOverride.kt — top-level file, inject logger alongside import replacement
patch(path.join(maxSdkBase, 'FindPermissionsToOverride.kt'), [
  [
    // Anchor is the import line itself — gone after replacement, so idempotent
    'import org.gradle.internal.cc.base.logger\n',
    'import org.gradle.api.logging.Logging\n\nprivate val logger = Logging.getLogger("expo.modules.plugin.FindPermissionsToOverride")\n',
  ],
]);

// ── expo-autolinking-plugin ───────────────────────────────────────────────────

const autolinkingPluginBase = path.join(
  autolinkingGradlePlugin,
  'expo-autolinking-plugin',
  'src', 'main', 'kotlin', 'expo', 'modules', 'plugin'
);

// ExpoRootProjectPlugin.kt — replace internal extensions.core.extra with extraProperties
patch(path.join(autolinkingPluginBase, 'ExpoRootProjectPlugin.kt'), [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'extra.setIfNotExist(',
    'extensions.extraProperties.setIfNotExist(',
  ],
  [
    'extra.get("kotlinVersion")',
    'extensions.extraProperties.get("kotlinVersion")',
  ],
]);

// ── expo-modules-core: expo-module-gradle-plugin ─────────────────────────────

// ExpoModulesGradlePlugin.kt — replace internal extra with extraProperties
patch(path.join(expoModulesCorePlugin, 'ExpoModulesGradlePlugin.kt'), [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'project.rootProject.extra.safeGet<String>(',
    'project.rootProject.extensions.extraProperties.safeGet<String>(',
  ],
]);

// ProjectConfiguration.kt — replace internal extra with extraProperties
patch(path.join(expoModulesCorePlugin, 'ProjectConfiguration.kt'), [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'extra.set("kotlinVersion",',
    'extensions.extraProperties.set("kotlinVersion",',
  ],
  [
    'extra.set("kspVersion",',
    'extensions.extraProperties.set("kspVersion",',
  ],
  [
    'rootProject.extra.safeGet(',
    'rootProject.extensions.extraProperties.safeGet(',
  ],
]);

// ExpoModuleExtension.kt — replace internal extra with extraProperties
patch(path.join(expoModulesCorePlugin, 'gradle', 'ExpoModuleExtension.kt'), [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'project.rootProject.extra.safeGet<Any>(name)',
    'project.rootProject.extensions.extraProperties.safeGet<Any>(name)',
  ],
]);

console.log('[patch-autolinking] Done.');
