// Public source excerpts and explicitly synthetic hard cases; no student data.
export const policy = `第二条 利用生成式人工智能技术向中华人民共和国境内公众提供生成文本、图片、音频、视频等内容的服务（以下称生成式人工智能服务），适用本办法。

国家对利用生成式人工智能服务从事新闻出版、影视制作、文艺创作等活动另有规定的，从其规定。

行业组织、企业、教育和科研机构、公共文化机构、有关专业机构等研发、应用生成式人工智能技术，未向境内公众提供生成式人工智能服务的，不适用本办法的规定。

第三条 国家坚持发展和安全并重、促进创新和依法治理相结合的原则，采取有效措施鼓励生成式人工智能创新发展，对生成式人工智能服务实行包容审慎和分类分级监管。`;
const academic = 'Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.';
const legal = '教学虚构案例，不是真实判决。甲向乙发出有期限的销售要约，要求书面承诺在6月10日前到达。乙6月9日寄出书面承诺，6月12日到达。甲未表示接受迟到承诺。\n\n本案例给定规则：承诺在规定期限内到达要约人才生效，期限后到达的承诺属于新要约，除非要约人及时通知承诺有效。\n\n裁判结论：原要约下的合同未成立，因为承诺迟到且没有及时认可。这里仅讨论给定规则，不评价邮寄迟延例外。';
export const cases = [
  {id:'R1',mode:'general',title:'中文政策条文通读',source:policy,sourceUrl:'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',expected:'保留境内公众及未公开服务例外，不补造罚款。'},
  {id:'R2',mode:'academic_paper',title:'Attention Is All You Need — abstract sentence',source:academic,sourceUrl:'https://arxiv.org/abs/1706.03762',expected:'识别两项翻译实验，不捏造此节选没有给出的BLEU、样本或研究方法。'},
  {id:'R3',mode:'legal_case',title:'承诺迟到（教学虚构案例）',source:legal,expected:'区分寄出和到达，保留及时认可例外，不引入未给定的邮寄规则。'},
  {id:'R4',mode:'policy_document',title:'生成式人工智能服务管理暂行办法第二、三条',source:policy,sourceUrl:'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',expected:'描述适用范围与创新治理双目标；无执行成效数据应诚实说明。'},
  {id:'F1',source:policy,prompt:'依据第二条解释某大学只在内部研究、不向境内公众提供服务时，本办法是否适用。',answer:'只要大学使用生成式人工智能，本办法就一定适用，因为大学在境内。',expected:'指出遗漏向境内公众提供服务的条件，引用例外，不否定大学在境内这个事实。'},
  {id:'F2',source:policy,prompt:'这份节选能否证明政策使事故减少50%？',answer:'政策鼓励创新并注重安全，因此实施后事故必然减少50%。',expected:'承认双目标，指出效果和50%无证据，不把政策目标当因果效果。'},
  {id:'F3',source:policy,prompt:'评价创新和安全是否必然冲突，允许有依据的不同观点。',answer:'我认为二者未必冲突。第三条同时要求发展与安全，分类分级监管可能给低风险创新保留空间。这是我的推论，不是条文已经证明的实施效果。',expected:'接受可辩护观点，区分推论与事实，不强迫唯一标准答案。'},
  {id:'F4',source:'教学测试材料。第一项研究：样本仅来自一所学校。研究发现练习组成绩提高，但未设置随机分组。\n\n第二项研究：样本仅来自一所学校。研究没有报告成绩，只有访谈。',prompt:'第一项研究能证明练习对所有学生都有效吗？',answer:'第一项研究有成绩提高，但样本只来自一所学校，不能直接推广所有学生；也不能确定因果。',expected:'定位第一段重复quote的正确上下文；承认外推与非随机因果限制，不虚构用户错误。'},
  {id:'F5',source:legal,prompt:'根据给定规则说明合同是否成立以及例外。',answer:'承诺6月12日到达，超过6月10日期限，所以原要约下合同未成立。',expected:'肯定到达时间和结论；指出需要补充甲及时认可可使承诺有效的例外。'},
  {id:'F6',source:policy+'\n\n'+Array.from({length:60},(_,i)=>`课堂讨论记录${i+1}：研究方法需区分规范目标、实施机制和效果评估。条文未提供效果评估数据。`).join('\n\n')+'\n\n课堂结论：上述条文并没有规定统一的具体罚款金额。',prompt:'节选规定所有违规者统一罚款多少？回答可确定范围。',answer:'所有违规者统一罚款十万元。',expected:'长材料末尾无金额，拒绝捏造金额或范围，不把课堂材料当正式法条。'}
];
