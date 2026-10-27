/**
 * 职位画像 - 意向工作城市 mock 数据。
 *
 * 仅用于 /ihire/profile/knowledge/area/tree 尚未部署到测试环境时联调；
 * 接口恢复后 ProfileKnowledgeApi 会优先返回真实数据，本文件可直接删除。
 * 数据结构与真实接口保持一致：{ dataTypeId, dataTypeValueName, parentId, children }
 */
export const MOCK_PROFILE_AREA_TREE = [
  {
    dataTypeId: 11,
    dataTypeValueName: "北京",
    parentId: null,
    children: [
      {
        dataTypeId: 1101,
        dataTypeValueName: "北京市",
        parentId: 11,
        children: [
          { dataTypeId: 110101, dataTypeValueName: "东城区", parentId: 1101, children: [] },
          { dataTypeId: 110102, dataTypeValueName: "西城区", parentId: 1101, children: [] },
          { dataTypeId: 110105, dataTypeValueName: "朝阳区", parentId: 1101, children: [] },
          { dataTypeId: 110106, dataTypeValueName: "丰台区", parentId: 1101, children: [] },
          { dataTypeId: 110108, dataTypeValueName: "海淀区", parentId: 1101, children: [] },
          { dataTypeId: 110112, dataTypeValueName: "通州区", parentId: 1101, children: [] }
        ]
      }
    ]
  },
  {
    dataTypeId: 31,
    dataTypeValueName: "上海",
    parentId: null,
    children: [
      {
        dataTypeId: 3101,
        dataTypeValueName: "上海市",
        parentId: 31,
        children: [
          { dataTypeId: 310101, dataTypeValueName: "黄浦区", parentId: 3101, children: [] },
          { dataTypeId: 310104, dataTypeValueName: "徐汇区", parentId: 3101, children: [] },
          { dataTypeId: 310105, dataTypeValueName: "长宁区", parentId: 3101, children: [] },
          { dataTypeId: 310106, dataTypeValueName: "静安区", parentId: 3101, children: [] },
          { dataTypeId: 310115, dataTypeValueName: "浦东新区", parentId: 3101, children: [] }
        ]
      }
    ]
  },
  {
    dataTypeId: 33,
    dataTypeValueName: "浙江",
    parentId: null,
    children: [
      {
        dataTypeId: 3301,
        dataTypeValueName: "杭州市",
        parentId: 33,
        children: [
          { dataTypeId: 330102, dataTypeValueName: "上城区", parentId: 3301, children: [] },
          { dataTypeId: 330105, dataTypeValueName: "拱墅区", parentId: 3301, children: [] },
          { dataTypeId: 330106, dataTypeValueName: "西湖区", parentId: 3301, children: [] },
          { dataTypeId: 330108, dataTypeValueName: "滨江区", parentId: 3301, children: [] },
          { dataTypeId: 330110, dataTypeValueName: "余杭区", parentId: 3301, children: [] }
        ]
      },
      {
        dataTypeId: 3302,
        dataTypeValueName: "宁波市",
        parentId: 33,
        children: [
          { dataTypeId: 330203, dataTypeValueName: "海曙区", parentId: 3302, children: [] },
          { dataTypeId: 330205, dataTypeValueName: "江北区", parentId: 3302, children: [] },
          { dataTypeId: 330212, dataTypeValueName: "鄞州区", parentId: 3302, children: [] }
        ]
      }
    ]
  },
  {
    dataTypeId: 32,
    dataTypeValueName: "江苏",
    parentId: null,
    children: [
      {
        dataTypeId: 3201,
        dataTypeValueName: "南京市",
        parentId: 32,
        children: [
          { dataTypeId: 320102, dataTypeValueName: "玄武区", parentId: 3201, children: [] },
          { dataTypeId: 320104, dataTypeValueName: "秦淮区", parentId: 3201, children: [] },
          { dataTypeId: 320106, dataTypeValueName: "鼓楼区", parentId: 3201, children: [] },
          { dataTypeId: 320105, dataTypeValueName: "建邺区", parentId: 3201, children: [] }
        ]
      },
      {
        dataTypeId: 3205,
        dataTypeValueName: "苏州市",
        parentId: 32,
        children: [
          { dataTypeId: 320508, dataTypeValueName: "姑苏区", parentId: 3205, children: [] },
          { dataTypeId: 320506, dataTypeValueName: "吴中区", parentId: 3205, children: [] },
          { dataTypeId: 320507, dataTypeValueName: "相城区", parentId: 3205, children: [] }
        ]
      }
    ]
  },
  {
    dataTypeId: 44,
    dataTypeValueName: "广东",
    parentId: null,
    children: [
      {
        dataTypeId: 4401,
        dataTypeValueName: "广州市",
        parentId: 44,
        children: [
          { dataTypeId: 440103, dataTypeValueName: "荔湾区", parentId: 4401, children: [] },
          { dataTypeId: 440104, dataTypeValueName: "越秀区", parentId: 4401, children: [] },
          { dataTypeId: 440105, dataTypeValueName: "海珠区", parentId: 4401, children: [] },
          { dataTypeId: 440106, dataTypeValueName: "天河区", parentId: 4401, children: [] }
        ]
      },
      {
        dataTypeId: 4403,
        dataTypeValueName: "深圳市",
        parentId: 44,
        children: [
          { dataTypeId: 440303, dataTypeValueName: "罗湖区", parentId: 4403, children: [] },
          { dataTypeId: 440304, dataTypeValueName: "福田区", parentId: 4403, children: [] },
          { dataTypeId: 440305, dataTypeValueName: "南山区", parentId: 4403, children: [] },
          { dataTypeId: 440306, dataTypeValueName: "宝安区", parentId: 4403, children: [] }
        ]
      }
    ]
  }
];

export default MOCK_PROFILE_AREA_TREE;
