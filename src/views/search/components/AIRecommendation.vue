<template>
  <div class="ai-recommendation">
    <el-row v-if="criteria && Object.keys(criteria).length > 0" class="height-btm-row">
      <el-col :span="24" style="display: flex; flex-direction: column; gap: 12px">
        <!-- 专业技能标签 -->
        <div v-if="criteria.professional_skills && criteria.professional_skills.length > 0" class="tag-section">
          <span class="tag-title">专业技能：</span>
          <div class="tag-container">
            <el-tag
              v-for="(item, index) in criteria.professional_skills.slice(0, 2)"
              :key="'skill-' + index"
              closable
              type="primary"
              @close="removeItem('professional_skills', index)"
            >
              <el-tooltip :content="item" placement="top" :show-after="200">
                <span class="tag-text">{{ item }}</span>
              </el-tooltip>
            </el-tag>
            <el-tag v-if="criteria.professional_skills.length > 2" type="success">
              <el-tooltip :content="criteria.professional_skills.slice(2).join('、')" placement="top" :show-after="200">
                <span>...</span>
              </el-tooltip>
            </el-tag>
          </div>
        </div>

        <!-- 软实力标签 -->
        <div v-if="criteria.soft_skills && criteria.soft_skills.length > 0" class="tag-section">
          <span class="tag-title">软实力：</span>
          <div class="tag-container">
            <el-tag
                v-for="(item, index) in criteria.soft_skills.slice(0, 2)"
                :key="'soft-' + index"
                closable
                type="warning"
                @close="removeItem('soft_skills', index)"
            >
              <el-tooltip :content="item" placement="top" :show-after="200">
                <span class="tag-text">{{ item }}</span>
              </el-tooltip>
            </el-tag>
            <el-tag v-if="criteria.soft_skills.length > 2" type="warning">
              <el-tooltip :content="criteria.soft_skills.slice(2).join('、')" placement="top" :show-after="200">
                <span>...</span>
              </el-tooltip>
            </el-tag>
          </div>
        </div>

        <!-- 工作经验标签 -->
        <div v-if="criteria.work_experience && criteria.work_experience.length > 0" class="tag-section">
          <span class="tag-title">工作经验：</span>
          <div class="tag-container">
            <el-tag
              v-for="(item, index) in criteria.work_experience.slice(0, 2)"
              :key="'exp-' + index"
              closable
              type="info"
              @close="removeItem('work_experience', index)"
            >
              <el-tooltip :content="item" placement="top" :show-after="200">
                <span class="tag-text">{{ item }}</span>
              </el-tooltip>
            </el-tag>
            <el-tag v-if="criteria.work_experience.length > 2" type="info">
              <el-tooltip :content="criteria.work_experience.slice(2).join('、')" placement="top" :show-after="200">
                <span>...</span>
              </el-tooltip>
            </el-tag>
          </div>
        </div>



        <div class="action-buttons">
          <el-button class="edit-btn" type="primary" link @click="openEditDialog">修改</el-button>
          <el-button class="clear-btn" type="primary" link @click="$emit('clear')">清空</el-button>
        </div>
      </el-col>
    </el-row>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      title="编辑AI推荐"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="edit-section">
        <!-- 专业技能编辑 -->
        <div class="section-group">
          <h3><el-icon><Tools /></el-icon> 专业技能</h3>
          <div class="edit-tags-container">
            <el-tag
              v-for="(skill, index) in editableCriteria.professional_skills"
              :key="'edit-skill-' + index"
              class="edit-tag"
              closable
              type="primary"
              @close="removeEditItem('professional_skills', index)"
            >
              <el-input
                v-model="editableCriteria.professional_skills[index]"
                class="tag-input"
                size="small"
                placeholder="输入专业技能"
              />
            </el-tag>
            <el-button class="add-tag-btn" type="primary" plain @click="addItem('professional_skills')">
              <el-icon><Plus /></el-icon> 添加专业技能
            </el-button>
          </div>
        </div>

        <!-- 软实力编辑 -->
        <div class="section-group">
          <h3><el-icon><Star /></el-icon> 软实力</h3>
          <div class="edit-tags-container">
            <el-tag
              v-for="(skill, index) in editableCriteria.soft_skills"
              :key="'edit-soft-' + index"
              class="edit-tag"
              closable
              type="warning"
              @close="removeEditItem('soft_skills', index)"
            >
              <el-input
                v-model="editableCriteria.soft_skills[index]"
                class="tag-input"
                size="small"
                placeholder="输入软实力"
              />
            </el-tag>
            <el-button class="add-tag-btn" type="warning" plain @click="addItem('soft_skills')">
              <el-icon><Plus /></el-icon> 添加软实力
            </el-button>
          </div>
        </div>

        <!-- 工作经验编辑 -->
        <div class="section-group">
          <h3><el-icon><Briefcase /></el-icon> 工作经验</h3>
          <div class="edit-tags-container">
            <el-tag
              v-for="(exp, index) in editableCriteria.work_experience"
              :key="'edit-exp-' + index"
              class="edit-tag"
              closable
              type="info"
              @close="removeEditItem('work_experience', index)"
            >
              <el-input
                v-model="editableCriteria.work_experience[index]"
                class="tag-input"
                size="small"
                placeholder="输入工作经验"
              />
            </el-tag>
            <el-button class="add-tag-btn" type="info" plain @click="addItem('work_experience')">
              <el-icon><Plus /></el-icon> 添加工作经验
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveChanges">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch } from 'vue'
import _ from 'lodash'
import { Delete, Tools, Star, Briefcase, Plus } from '@element-plus/icons-vue'

const props = defineProps({
  criteria: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:criteria', 'clear'])

const dialogVisible = ref(false)
const editableCriteria = ref({
  professional_skills: [],
  soft_skills: [],
  work_experience: []
})

// 监听props变化，更新编辑数据
watch(() => props.criteria, (newVal) => {
  if (newVal) {
    editableCriteria.value = _.cloneDeep(newVal)
  }
}, { deep: true })

// 打开编辑对话框
const openEditDialog = () => {
  editableCriteria.value = _.cloneDeep(props.criteria)
  dialogVisible.value = true
}

// 保存修改
const saveChanges = () => {
  emit('update:criteria', _.cloneDeep(editableCriteria.value))
  dialogVisible.value = false
}

// 移除标签
const removeItem = (category, index) => {
  const newCriteria = _.cloneDeep(props.criteria)
  newCriteria[category].splice(index, 1)
  emit('update:criteria', newCriteria)
}

// 编辑时移除项目
const removeEditItem = (category, index) => {
  editableCriteria.value[category].splice(index, 1)
}

// 添加新项目
const addItem = (category) => {
  editableCriteria.value[category].push('')
}
</script>

<style scoped lang="scss">
.ai-recommendation {
  .tag-section {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    
    .tag-title {
      white-space: nowrap;
      color: #606266;
      font-size: 14px;
      line-height: 32px;
      font-weight: 400;
    }

    .tag-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  .action-buttons {
    display: flex;
    align-items: center;
    margin-top: 8px;
    
    .edit-btn,
    .clear-btn {
      font-size: 14px;
    }
  }

  :deep(.el-tag) {
    margin: 0;
    height: 32px;
    padding: 0 12px;
    font-size: 14px;
  }
.tag-text {
  display: inline-block;
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
}
.action-buttons {
    display: flex;
    align-items: center;
    margin-left: 8px;
  }

  .edit-section {
    max-height: 60vh;
    overflow-y: auto;
    padding: 0 20px;

    .section-group {
      margin-bottom: 24px;

      h3 {
        margin-bottom: 16px;
        font-size: 16px;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;

        .el-icon {
          font-size: 18px;
        }
      }

      .edit-tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        
        .edit-tag {
          margin: 0;
          padding: 0 8px;
          height: 32px;
          max-width: none;
          
          .tag-input {
            background: transparent;
            border: none;
            color: inherit;
            width: auto;
            min-width: auto;
            
            :deep(.el-input__wrapper) {
              background: transparent;
              box-shadow: none;
              padding: 0;
              width: auto;
            }
            
            :deep(.el-input__inner) {
              color: inherit;
              height: 24px;
              line-height: 24px;
              padding: 0;
              width: auto;
            }
          }
        }

        .add-tag-btn {
          height: 32px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
      }
    }
  }

  :deep(.el-tag) {
    margin-right: 8px;
    margin-bottom: 8px;
  }

  .dialog-footer {
    padding: 20px 0 0;
    text-align: right;
  }

  .deleteBtm {
    background-color: #ff244a;
    border-radius: 0;
    color: white;
  }
</style>