<template>
  <div class="left-header-container">
    <el-menu
        active-text-color="#ffd04b"
        background-color="#545c64"
        class="el-menu-vertical-demo"
        default-active="2"
        text-color="#fff"
        @open="handleOpen"
        @close="handleClose"
    >
      <template v-for="menu in menuDataRef" :key="menu.id">
        <template v-if="menu.type==='el-sub-menu'">
          <el-sub-menu :index="menu.id">
            <template #title>
              <Aicon :icon="menu.icon" :style="`font-size: ${menu.iconSize?menu.iconSize:'1rem'};margin:${menuIconMarginStyle}`"></Aicon>
              <span>{{ menu.title }}</span>
            </template>
            <template v-if="menu.child">
              <template v-for="menuChild in menu.child" :key="menuChild.id">
                <template v-if="menuChild.type==='el-sub-menu'">
                  <el-sub-menu :index="menuChild.id">
                    <template #title>
                      <Aicon :icon="menuChild.icon" :style="`font-size: ${menuChild.iconSize?menuChild.iconSize:'1rem'};margin:${menuIconMarginStyle}`"></Aicon>
                      <span>{{ menuChild.title }}</span>
                    </template>
                    <template v-if="menuChild.child">
                      <template v-for="smallMenu in menuChild.child" :key="smallMenu.id">
                        <el-menu-item :index="smallMenu.id" @click="myHerf(smallMenu)">
                          <Aicon :icon="smallMenu.icon" :style="`font-size: ${smallMenu.iconSize?smallMenu.iconSize:'1rem'};margin:${menuIconMarginStyle}`"></Aicon>
                          <span>{{ smallMenu.title }}</span>
                        </el-menu-item>
                      </template>
                    </template>
                  </el-sub-menu>
                </template>
                <template v-else>
                  <el-menu-item :index="menuChild.id" @click="myHerf(menuChild)">
                    <Aicon :icon="menuChild.icon" :style="`font-size: ${menuChild.iconSize?menuChild.iconSize:'1rem'};margin:${menuIconMarginStyle}`"></Aicon>
                    <span>{{ menuChild.title }}</span>
                  </el-menu-item>
                </template>
              </template>
            </template>
          </el-sub-menu>
        </template>
        <template v-else>
          <el-menu-item :index="menu.id" @click="myHerf(menu)">
            <Aicon :icon="menu.icon" :style="`font-size: ${menu.iconSize?menu.iconSize:'1rem'};margin:${menuIconMarginStyle}`"></Aicon>
            <span>{{ menu.title }}</span>
          </el-menu-item>
        </template>
      </template>
    </el-menu>
  </div>

</template>

<script setup>
import {ref} from "vue";
import Aicon from "@/components/Aicon/index.vue";
import router from "@/router";
const menuIconMarginStyle = ref("0 6px 0 0");
const menudata = [{
  type:'el-sub-menu',
  id:1,
  parentId:0,
  icon:'el-icon-wenzhang1',
  iconSize:'1rem',
  title:'Navigator One',
  path:'',
  child:[{
    type:'el-menu-item',
    id:11,
    parentId:1,
    icon:'el-icon-daohang3',
    iconSize:'1rem',
    title:'item one',
    path:'',
    child:[]
  },{
    type:'el-menu-item',
    id:12,
    parentId:1,
    icon:'el-icon-daohang3',
    iconSize:'1rem',
    title:'item Two',
    path:'',
    child:[]
  },{
    type:'el-sub-menu',
    id:13,
    parentId:1,
    icon:'el-icon-daohang4',
    iconSize:'1rem',
    title:'Group',
    path:'',
    child:[{
      type:'el-menu-item',
      id:131,
      parentId:13,
      icon:'el-icon-zhankai',
      iconSize:'1rem',
      title:'item four',
      path:'',
      child:[]
    }]
  }]
},{
  type:'el-menu-item',
  id:2,
  parentId:0,
  icon:'el-icon-xiangmuchuangjian',
  iconSize:'1rem',
  title:'Navigator Two',
  path:'',
  child:[]
},{
  type:'el-menu-item',
  id:3,
  parentId:0,
  icon:'el-icon-ddd2',
  iconSize:'1rem',
  title:'智能查询',
  path:'/search',
  child:[]
},{
  type:'el-menu-item',
  id:4,
  parentId:0,
  icon:'el-icon-zhankai',
  iconSize:'1rem',
  title:'设置（暂时）',
  path:'/setting',
  child:[]
}];
const menuDataRef = ref(menudata);



const handleOpen = (key, keyPath) => {
}
const handleClose = (key, keyPath) => {
}

const myHerf = (menuConfig) => {
  router.push(menuConfig.path?menuConfig.path:"/")
}

</script>

<style scoped lang="scss">

</style>