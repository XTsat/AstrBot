<script setup>
import { LazyMonacoEditor as VueMonacoEditor } from '@/components/shared/LazyMonacoEditor';
import { ref, computed, watch } from 'vue'
import ConfigItemRenderer from './ConfigItemRenderer.vue'
import ConfigDefaultReset from './ConfigDefaultReset.vue'
import TemplateListEditor from './TemplateListEditor.vue'
import { useI18n, useModuleI18n } from '@/i18n/composables'
import { useConfigTextResolver } from '@/composables/useConfigTextResolver'
import { useToast } from '@/utils/toast'
import { FOLD_STATE_PREFIX, readFoldState, writeFoldState } from '@/utils/configFoldState.mjs'
import { providerApi } from '@/api/v1'

const props = defineProps({
  metadata: {
    type: Object,
    required: true
  },
  iterable: {
    type: Object,
    required: true
  },
  metadataKey: {
    type: String,
    required: true
  },
  pluginName: {
    type: String,
    default: ''
  },
  pluginI18n: {
    type: Object,
    default: () => ({})
  },
  pathPrefix: {
    type: String,
    default: ''
  },
  isEditing: {
    type: Boolean,
    default: false
  },
  enableDefaultReset: {
    type: Boolean,
    default: false
  },
  fieldLinks: {
    type: Object,
    default: () => ({})
  }
})

const { t } = useI18n()
const { getRaw } = useModuleI18n('features/config-metadata')
const { translateIfKey, resolveConfigText } = useConfigTextResolver(props)
const currentConfigPath = computed(() => props.pathPrefix || props.metadataKey)

const filteredIterable = computed(() => {
  if (!props.iterable) return {}
  const { hint, ...rest } = props.iterable
  return rest
})

const providerHint = computed(() => {
  const hint = props.iterable?.hint
  if (typeof hint !== 'string' || !hint) return ''

  if (
    hint === 'provider_group.provider.openai_embedding.hint'
    || hint === 'provider_group.provider.gemini_embedding.hint'
  ) {
    return ''
  }

  return hint
})

const getItemHint = (itemKey, itemMeta) => {
  if (itemMeta?.hint) return itemMeta.hint

  if (itemKey !== 'embedding_api_base') return ''

  const providerType = props.iterable?.type
  if (providerType === 'openai_embedding') {
    return getRaw('provider_group.provider.openai_embedding.hint')
      ? 'provider_group.provider.openai_embedding.hint'
      : ''
  }
  if (providerType === 'gemini_embedding') {
    return getRaw('provider_group.provider.gemini_embedding.hint')
      ? 'provider_group.provider.gemini_embedding.hint'
      : ''
  }

  return ''
}

const dialog = ref(false)
const currentEditingKey = ref('')
const currentEditingLanguage = ref('json')
const currentEditingTheme = ref('vs-light')
let currentEditingKeyIterable = null
const loadingEmbeddingDim = ref(false)

function openEditorDialog(key, value, theme, language) {
  currentEditingKey.value = key
  currentEditingLanguage.value = language || 'json'
  currentEditingTheme.value = theme || 'vs-light'
  currentEditingKeyIterable = value
  dialog.value = true
}


function saveEditedContent() {
  dialog.value = false
}

async function getEmbeddingDimensions(providerConfig) {
  if (loadingEmbeddingDim.value) return
  
  loadingEmbeddingDim.value = true
  try {
    const providerId = String(providerConfig?.id || '')
    if (!providerId) {
      useToast().error('缺少提供商 ID')
      return
    }
    const response = await providerApi.embeddingDimension(providerId, providerConfig)
    
    if (response.data.status != "error" && response.data.data?.embedding_dimensions) {
      console.log(response.data.data.embedding_dimensions)
      providerConfig.embedding_dimensions = response.data.data.embedding_dimensions
      useToast().success("获取成功: " + response.data.data.embedding_dimensions)
    } else {
      useToast().error(response.data.message)
    }
  } catch (error) {
    console.error('Error getting embedding dimensions:', error)
  } finally {
    loadingEmbeddingDim.value = false
  }
}

function getValueBySelector(obj, selector) {
  const keys = selector.split('.')
  let current = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key]
    } else {
      return undefined
    }
  }
  return current
}

function shouldShowItem(itemMeta, itemKey) {
  if (!itemMeta?.condition) {
    return true
  }
  for (const [conditionKey, expectedValue] of Object.entries(itemMeta.condition)) {
    const actualValue = getValueBySelector(props.iterable, conditionKey)
    if (actualValue !== expectedValue) {
      return false
    }
  }
  return true
}

function getItemPath(key) {
  return props.pathPrefix ? `${props.pathPrefix}.${key}` : key
}

function hasVisibleItemsAfter(items, currentIndex) {
  const itemEntries = Object.entries(items)

  // 检查当前索引之后是否还有可见的配置项
  for (let i = currentIndex + 1; i < itemEntries.length; i++) {
    const [itemKey, itemValue] = itemEntries[i]
    const itemMeta = props.metadata[props.metadataKey].items[itemKey]
    if (!itemMeta?.invisible && shouldShowItem(itemMeta, itemKey)) {
      return true
    }
  }

  return false
}

// Every nested object group is foldable; the schema only decides its initial state
// via `collapsed: true`. The root config object itself is never foldable. Toggling is
// remembered for this page instance only, so reopening the page follows the schema.
const isFoldable = computed(
  () => Boolean(props.pathPrefix) && props.metadata?.[props.metadataKey]?.type === 'object'
)
const foldStateKey = computed(
  () => `${FOLD_STATE_PREFIX}${props.pluginName}:${currentConfigPath.value}`
)

function getInitialFoldedState() {
  return props.metadata?.[props.metadataKey]?.collapsed === true
}

function resolveFoldedState(key) {
  const remembered = readFoldState(key)
  return remembered === null ? getInitialFoldedState() : remembered
}

const isFolded = ref(resolveFoldedState(foldStateKey.value))
const isSectionCollapsed = computed(() => isFoldable.value && isFolded.value)

// Switching to another config (provider, platform, ...) reuses this instance, so the
// remembered state must be re-read for the new group.
watch(foldStateKey, (key) => {
  isFolded.value = resolveFoldedState(key)
})

function toggleSection() {
  if (!isFoldable.value) {
    return
  }
  isFolded.value = !isFolded.value
  writeFoldState(foldStateKey.value, isFolded.value)
}
</script>

<template>
  <div
    class="config-section"
    :class="{ 'config-section--folded': isSectionCollapsed }"
    v-if="iterable && metadata[metadataKey]?.type === 'object'"
  >
    <div
      class="config-section-head"
      :class="{
        'config-section-head--foldable': isFoldable,
        'config-section-head--folded': isSectionCollapsed,
      }"
      :role="isFoldable ? 'button' : undefined"
      :tabindex="isFoldable ? 0 : undefined"
      :aria-expanded="isFoldable ? !isSectionCollapsed : undefined"
      :title="isFoldable ? (isSectionCollapsed ? t('core.common.expand') : t('core.common.collapse')) : undefined"
      @click="toggleSection"
      @keydown.enter.prevent="toggleSection"
      @keydown.space.prevent="toggleSection"
    >
      <v-icon v-if="isFoldable" size="18" class="config-section-head__chevron">
        {{ isSectionCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
      </v-icon>
      <div class="config-section-head__text">
        <v-list-item-title class="config-title">
          {{ resolveConfigText(currentConfigPath, 'description', metadata[metadataKey]?.description) }}
          <span v-if="metadata[metadataKey]?.show_key" class="metadata-key">({{ metadataKey }})</span>
        </v-list-item-title>
        <v-list-item-subtitle class="config-hint">
          <span v-if="metadata[metadataKey]?.obvious_hint && metadata[metadataKey]?.hint" class="important-hint">‼️</span>
          {{ resolveConfigText(currentConfigPath, 'hint', metadata[metadataKey]?.hint) }}
        </v-list-item-subtitle>
      </div>
    </div>
  </div>

  <v-expand-transition>
    <v-card-text class="px-0 py-1" v-show="!isSectionCollapsed">
    <!-- Object Type Configuration -->
    <div v-if="metadata[metadataKey]?.type === 'object' || metadata[metadataKey]?.config_template" class="object-config">
      <!-- Provider-level hint -->
      <v-alert
        v-if="providerHint"
        type="info"
        variant="tonal"
        class="mb-4"
        border="start"
        density="compact"
      >
        {{ translateIfKey(providerHint) }}
      </v-alert>

      <div v-for="(val, key, index) in filteredIterable" :key="key" class="config-item">
        <!-- Nested Object -->
        <div v-if="metadata[metadataKey].items[key]?.type === 'object'" class="nested-object">
          <div v-if="metadata[metadataKey].items[key] && !metadata[metadataKey].items[key]?.invisible && shouldShowItem(metadata[metadataKey].items[key], key)" class="nested-container">
            <v-expand-transition>
              <AstrBotConfig
                :metadata="metadata[metadataKey].items"
                :iterable="iterable[key]"
                :metadataKey="key"
                :pluginName="pluginName"
                :pluginI18n="pluginI18n"
                :pathPrefix="getItemPath(key)"
                :enable-default-reset="enableDefaultReset"
              >
              </AstrBotConfig>
            </v-expand-transition>
          </div>
        </div>

        <!-- Template List -->
        <div v-else-if="metadata[metadataKey].items[key]?.type === 'template_list'" class="nested-object w-100">
          <div v-if="!metadata[metadataKey].items[key]?.invisible && shouldShowItem(metadata[metadataKey].items[key], key)" class="nested-container">
            <div class="config-section mb-2">
              <v-list-item-title class="config-title">
                <span v-if="metadata[metadataKey].items[key]?.description">
                  {{ resolveConfigText(getItemPath(key), 'description', metadata[metadataKey].items[key]?.description) }}
                  <span v-if="metadata[metadataKey].items[key]?.show_key" class="property-key">({{ key }})</span>
                </span>
                <span v-else>{{ key }}</span>
              </v-list-item-title>
              <v-list-item-subtitle class="config-hint">
                <span v-if="metadata[metadataKey].items[key]?.obvious_hint && metadata[metadataKey].items[key]?.hint" class="important-hint">‼️</span>
                {{ resolveConfigText(getItemPath(key), 'hint', metadata[metadataKey].items[key]?.hint) }}
              </v-list-item-subtitle>
            </div>
            <ConfigDefaultReset
              :model-value="iterable[key]"
              :item-meta="metadata[metadataKey].items[key]"
              :enabled="enableDefaultReset"
              @reset="iterable[key] = $event"
            >
              <TemplateListEditor
                v-model="iterable[key]"
                :templates="metadata[metadataKey].items[key]?.templates || {}"
                :plugin-name="pluginName"
                :plugin-i18n="pluginI18n"
                :config-path="getItemPath(key)"
                class="config-field"
              />
            </ConfigDefaultReset>
          </div>
        </div>

        <!-- Regular Property -->
        <template v-else>
          <v-row v-if="!metadata[metadataKey].items[key]?.invisible && shouldShowItem(metadata[metadataKey].items[key], key)" class="config-row">
            <v-col cols="12" sm="6" class="property-info">
              <v-list-item density="compact">
                <v-list-item-title class="property-name">
                  <span v-if="metadata[metadataKey].items[key]?.description">
                    {{ resolveConfigText(getItemPath(key), 'description', metadata[metadataKey].items[key]?.description) }}
                    <span v-if="metadata[metadataKey].items[key]?.show_key" class="property-key">({{ key }})</span>
                  </span>
                  <span v-else>{{ key }}</span>
                </v-list-item-title>

                <v-list-item-subtitle class="property-hint">
                  <span :class="{ 'property-hint__content--linked': fieldLinks[key] }">
                    <span v-if="metadata[metadataKey].items[key]?.obvious_hint && getItemHint(key, metadata[metadataKey].items[key])"
                          class="important-hint">‼️</span>
                    <span>{{ resolveConfigText(getItemPath(key), 'hint', getItemHint(key, metadata[metadataKey].items[key])) }}</span>
                    <a
                      v-if="fieldLinks[key]"
                      class="property-link"
                      :href="fieldLinks[key].href"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click.stop
                    >{{ fieldLinks[key].label }}</a>
                  </span>
                </v-list-item-subtitle>
              </v-list-item>
            </v-col>

            <v-col cols="12" sm="6" class="config-input">
              <ConfigDefaultReset
                :model-value="iterable[key]"
                :item-meta="metadata[metadataKey].items[key]"
                :enabled="enableDefaultReset"
                @reset="iterable[key] = $event"
              >
                <ConfigItemRenderer
                  v-model="iterable[key]"
                  :item-meta="metadata[metadataKey].items[key] || null"
                  :plugin-name="pluginName"
                  :plugin-i18n="pluginI18n"
                  :config-key="getItemPath(key)"
                  :loading="loadingEmbeddingDim"
                  :show-fullscreen-btn="!!metadata[metadataKey].items[key]?.editor_mode"
                  @get-embedding-dim="getEmbeddingDimensions(iterable)"
                  @open-fullscreen="openEditorDialog(key, iterable, metadata[metadataKey].items[key]?.editor_theme, metadata[metadataKey].items[key]?.editor_language)"
                />
              </ConfigDefaultReset>
            </v-col>
          </v-row>

          <v-divider
            v-if="hasVisibleItemsAfter(filteredIterable, index) && !metadata[metadataKey].items[key]?.invisible && shouldShowItem(metadata[metadataKey].items[key], key)"
            class="config-divider"
          ></v-divider>
        </template>
      </div>
    </div>

    <!-- Simple Value Configuration -->
    <div v-else class="simple-config">
      <v-row class="config-row">
        <v-col cols="12" sm="7" class="property-info">
          <v-list-item density="compact">
            <v-list-item-title class="property-name">
              {{ resolveConfigText(getItemPath(metadataKey), 'description', metadata[metadataKey]?.description) }}
              <span v-if="metadata[metadataKey]?.show_key" class="property-key">({{ metadataKey }})</span>
            </v-list-item-title>

            <v-list-item-subtitle class="property-hint">
              <span v-if="metadata[metadataKey]?.obvious_hint && metadata[metadataKey]?.hint" class="important-hint">‼️</span>
              {{ resolveConfigText(getItemPath(metadataKey), 'hint', metadata[metadataKey]?.hint) }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-col>

        <v-col cols="12" sm="5" class="config-input">
          <ConfigDefaultReset
            :model-value="iterable[metadataKey]"
            :item-meta="metadata[metadataKey]"
            :enabled="enableDefaultReset"
            @reset="iterable[metadataKey] = $event"
          >
            <TemplateListEditor
              v-if="metadata[metadataKey]?.type === 'template_list' && !metadata[metadataKey]?.invisible"
              v-model="iterable[metadataKey]"
              :templates="metadata[metadataKey]?.templates || {}"
              :plugin-name="pluginName"
              :plugin-i18n="pluginI18n"
              :config-path="getItemPath(metadataKey)"
              class="config-field"
            />
            <ConfigItemRenderer
              v-else
              v-model="iterable[metadataKey]"
              :item-meta="metadata[metadataKey]"
              :plugin-name="pluginName"
              :plugin-i18n="pluginI18n"
              :config-key="getItemPath(metadataKey)"
            />
          </ConfigDefaultReset>
        </v-col>
      </v-row>

      <v-divider class="my-2 config-divider"></v-divider>
    </div>
  </v-card-text>
  </v-expand-transition>

  <!-- Full Screen Editor Dialog -->
  <v-dialog v-model="dialog" fullscreen transition="dialog-bottom-transition" scrollable>
    <v-card>
      <v-toolbar color="primary" dark>
        <v-btn icon @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>{{ t('core.common.editor.editingTitle') }} - {{ currentEditingKey }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-toolbar-items>
          <v-btn variant="text" @click="saveEditedContent">{{ t('core.common.save') }}</v-btn>
        </v-toolbar-items>
      </v-toolbar>
      <v-card-text class="pa-0">
        <VueMonacoEditor
          :theme="currentEditingTheme"
          :language="currentEditingLanguage"
          style="height: calc(100vh - 64px);"
          v-model:value="currentEditingKeyIterable[currentEditingKey]"
        >
        </VueMonacoEditor>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>



<style scoped>
.config-section {
  margin-bottom: 12px;
  transition: margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.config-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--v-theme-primaryText);
}

.config-section-head {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.config-section-head--foldable {
  cursor: pointer;
  user-select: none;
  /* Fill the container padding so the hover background reaches the card edges,
     matching the template_list entry header. The container clips the corners. */
  padding: 20px 12px 8px;
  margin: -12px -12px 0;
  border-radius: 0;
  transition:
    background-color 0.2s ease,
    padding-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.config-section-head--foldable:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

/* Folded groups have no body, so the header absorbs the container bottom padding
   too and the highlight fills the whole card. */
.config-section-head--folded {
  padding-bottom: 20px;
  margin-bottom: -12px;
}

/* The wrapper's own margin would leave a strip under the folded header. */
.config-section--folded {
  margin-bottom: 0;
}

.config-section-head--foldable:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.config-section-head__chevron {
  margin-top: 4px;
  color: var(--v-theme-secondaryText);
  flex-shrink: 0;
}

.config-section-head__text {
  flex: 1;
  min-width: 0;
}

.config-hint {
  font-size: 0.75rem;
  color: var(--v-theme-secondaryText);
  margin-top: 2px;
}

.metadata-key, .property-key {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 0.82em;
  font-weight: normal;
  margin-left: 4px;
}

.important-hint {
  opacity: 1;
  margin-right: 4px;
}

.object-config, .simple-config {
  width: 100%;
}

.config-item {
  margin-bottom: 2px;
}

.nested-object {
  padding-left: 16px;
}

.nested-container {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  background-color: rgba(0, 0, 0, 0.02);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  /* Keep the full-width fold header hover inside the rounded border. */
  overflow: hidden;
}

.config-row {
  margin: 0;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
}

.config-row:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.property-info {
  padding: 0;
}

.property-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--v-theme-primaryText);
}

.property-link {
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.property-link:hover {
  text-decoration: underline;
}

.property-hint {
  font-size: 0.75rem;
  color: var(--v-theme-secondaryText);
  margin-top: 2px;
}

.property-hint__content--linked {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.type-indicator {
  display: flex;
  justify-content: center;
}

.config-input {
  padding: 4px 8px;
}

.config-field {
  margin-bottom: 0;
}

.config-divider {
  border-color: rgba(0, 0, 0, 0.05);
  margin: 0px 16px;
}

.editor-container {
  position: relative;
  display: flex;
  width: 100%;
}

.editor-fullscreen-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.editor-fullscreen-btn:hover {
  background-color: rgba(0, 0, 0, 0.5);
}

@media (max-width: 600px) {
  .nested-object {
    padding-left: 8px;
  }

  .config-row {
    padding: 8px 0;
  }

  .property-info {
    padding: 4px 4px;
  }

  .property-info :deep(.v-list-item) {
    padding-inline: 0;
  }

  .type-indicator,
  .config-input {
    padding: 4px;
  }

  .config-divider {
    display: none;
  }
}
</style>
