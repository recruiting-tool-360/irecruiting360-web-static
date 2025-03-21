import cities from '@/views/search/dto/cities.json';
import provinces from '@/views/search/dto/provinces.json';

// 动态生成选项的函数
function generateOptions(start, end, suffix) {
    return Array.from({ length: end - start + 1 }, (_, i) => ({
        label: `${start + i}${suffix}`,
        value: `${start + i}`
    }));
}

// 渠道配置
export const channelOptions = [
    { eName: "ALL", id: "0",desc:"全渠道" },
    { eName: "BOSS", id: "1",desc:"boss直聘" },
];

// 渠道按钮
export const topChannelBtmOptions = [
    { value: 'ALL', label: '渠道聚合' },
    { value: 'BOSS', label: 'BOSS' },
    { value: 'Collect', label: '我的收藏' },
];

// 定义学历选项配置
export const degreeOptions = [
    { label: "不限", value: "201|201" },
    { label: "初中及以下", value: "209|209" },
    { label: "高中", value: "206|206" },
    { label: "中专/中技", value: "208|208" },
    { label: "大专", value: "202|202" },
    { label: "本科", value: "203|203" },
    { label: "硕士", value: "204|204" },
    { label: "博士", value: "205|205" },
];

// export const degreeOptions = [
//     { label: "不限", value: "201,201" },
//     { label: "本科及以上", value: "203,201" },
//     { label: "硕士及以上", value: "204,201" },
//     { label: "博士", value: "205,205" },
//     { label: "初中及以下-博士", value: "209,205" },
//     { label: "中专/中技-博士", value: "208,205" },
//     { label: "高中-博士", value: "206,205" },
//     { label: "大专-博士", value: "202,205" },
//     { label: "本科-博士", value: "203,205" },
//     { label: "硕士-博士", value: "204,205" }
// ];

// 定义性别选项配置
export const genderOptions = [
    { label: "不限", value: -1 },
    { label: "男", value: 1 },
    { label: "女", value: 0 }
];

// 定义院校选项配置
export const schoolLevelOptions = [
    { label: "不限", value: "-1" },
    { label: "统招本科", value: "1101" },
    { label: "双一流院校", value: "1102" },
    { label: "211院校", value: "1103" },
    { label: "985院校", value: "1104" },
    { label: "留学生", value: "1105" },
    { label: "QS 100", value: "1107" },
    { label: "QS 500", value: "1106" }
];
//在职状态
export const jobStatusOptions = [
    { label: '不限', value: '-1' },
    { label: '离职-随时到岗', value: '701' },
    { label: '在职-暂不考虑', value: '702' },
    { label: '在职-考虑机会', value: '703' },
    { label: '在职-月内到岗', value: '704' }
];

//薪资配置
export const salaryConfig = generateOptions(1, 200, "K");

// 转换函数
const transformData = (provinces, cities) => {
    return provinces.map(province => ({
        value: province.code,
        label: province.name,
        children: cities
            .filter(city => city.provinceCode === province.code)
            .map(city => ({
                value: city.code,
                parentCode:city.provinceCode,
                label: city.name
            }))
    }));
};

// 调用转换函数
export const citiesConfig = transformData(provinces, cities);





