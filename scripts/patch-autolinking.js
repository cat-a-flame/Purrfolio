#!/usr/bin/env node
/**
 * Patches expo-modules-autolinking to replace internal Gradle APIs
 * (org.gradle.internal.cc.base and org.gradle.internal.extensions.core)
 * with public equivalents, so the Kotlin settings plugin compiles on
 * any Gradle version (8.x or 9.x) without the 'cc'/'logger'/'extra' errors.
 */

const fs = require('fs');
const path = require('path');

const base = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-autolinking',
  'android',
  'expo-gradle-plugin',
  'expo-autolinking-settings-plugin',
  'src',
  'main',
  'kotlin',
  'expo',
  'modules',
  'plugin'
);

function patch(file, replacements) {
  const filePath = path.join(base, file);
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-autolinking] Skipping (not found): ${file}`);
    return;
  }
  let src = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`[patch-autolinking] Patched: ${file}`);
  } else {
    console.log(`[patch-autolinking] Already patched or not matched: ${file}`);
  }
}

// Fix 1: ExpoAutolinkingSettingsPlugin.kt
// Replace internal cc.base logger import with public Logging API
patch('ExpoAutolinkingSettingsPlugin.kt', [
  [
    'import org.gradle.internal.cc.base.logger',
    'import org.gradle.api.logging.Logging',
  ],
  [
    // The class-level usage of `logger` becomes an explicit Logging call
    `open class ExpoAutolinkingSettingsPlugin : Plugin<Settings> {`,
    `open class ExpoAutolinkingSettingsPlugin : Plugin<Settings> {\n  private val logger = Logging.getLogger(ExpoAutolinkingSettingsPlugin::class.java)`,
  ],
]);

// Fix 2: SettingsManager.kt
// Replace internal extensions.core.extra import with direct extraProperties access
patch('SettingsManager.kt', [
  [
    'import org.gradle.internal.extensions.core.extra\n',
    '',
  ],
  [
    'project.extra.set("coreFeatures", config.coreFeatures)',
    'project.extensions.extraProperties.set("coreFeatures", config.coreFeatures)',
  ],
]);

console.log('[patch-autolinking] Done.');
