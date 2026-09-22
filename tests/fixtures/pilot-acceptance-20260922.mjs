import { readFileSync } from 'node:fs';
import { cases as previous, policy } from './real-model-cases.mjs';

// Written before model calls. These are reviewer expectations, never model input.
// Teaching fixtures are explicitly synthetic; legislation and paper excerpts are sourced.
const concepts = '课堂教学材料（编写的测试样本）。议程设置关注公众认为哪些议题重要；框架关注如何理解一个议题。二者可以共同出现，不能仅凭一段报道断定受众实际态度发生变化。\n\n例子：连续突出失业报道可能提高失业议题的显著性；把失业解释为个人选择或经济结构问题体现不同框架。这里的“可能”是假设，没有受众调查或因果实验。';
const study = '课堂教学材料（编写的测试样本）。一所学校的自愿参加者接受练习，前后测成绩提高。没有随机分组，也没有未练习的对照组。\n\n样本只来自一所学校，不能直接推广所有学生。成绩提高可能还受到同期教学或重复测验影响；本材料没有估计这些因素各自的影响大小。';
const legal = previous.find(c=>c.id==='R3').source;
const pipl = readFileSync(new URL('./pipl-2021.txt',import.meta.url),'utf8').trimEnd();
const policyChecklist = ['适用条件是向境内公众提供服务','内部研发且不向公众提供服务例外','发展安全并重是规范目标，不是已证明的效果'];
export const cases = [
 {id:'G1',mode:'general',source:study,checklist:['观察到成绩提高','非随机且无对照，不能证明因果','单校自选样本的外推限制','替代解释没有影响量估计']},
 {id:'G2',mode:'general',source:concepts,checklist:['议题重要性与解释方式不同','二者可共存','报道形式不等于实证受众效果']},
 {id:'A1',mode:'academic_paper',title:'Lost in the Middle — two abstract excerpts, not full paper',source:'We find that performance can degrade significantly when changing the position of relevant information\n\n[…] even for explicitly long-context models',sourceUrl:'https://arxiv.org/abs/2307.03172',checklist:['位置变化会降低表现','长上下文模型也有此限制','短摘录没有具体任务、样本、数值或方法，不得补造']},
 {id:'L1',mode:'legal_case',source:legal,checklist:['教学虚构不是司法判例','到达而非寄出日期','迟到且未认可，原合同未成立','及时认可的例外；未评价邮寄迟延例外']},
 {id:'P1',mode:'policy_document',source:policy,sourceUrl:'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',checklist:policyChecklist},
 {id:'F1',source:concepts,prompt:'解释议程设置与框架的区别、举例，并说明材料能否证明受众效果。',rubric:'只要求概念区别、一个对应例子和效果边界。完整正确的答案不必人为寻找缺口。',answer:'议程设置涉及哪些议题重要，框架涉及如何理解议题。连续突出失业报道可能提高该议题显著性，把失业归因个人选择或经济结构体现不同框架。二者可以同时出现；这只是材料中的假设，没有受众调查或因果实验，不能证明实际态度变化。',checklist:['承认正确完整回答','不强加材料以外的术语/任务要求','不把假设误读为用户断言的效果']},
 {id:'F2',source:study,prompt:'这项研究能否证明练习对所有学生都有效？指出因果和推广边界。',answer:'成绩确实提高，但单校样本不能推广所有学生。',checklist:['肯定成绩和外推边界','指出缺少随机和对照导致因果不确定','不说用户否认成绩提高']},
 {id:'F3',source:legal,prompt:'说明合同是否成立、理由，以及给定规则的例外。',answer:'6月12日到达晚于6月10日，所以原合同未成立。',checklist:['结论和到达标准正确','遗漏及时通知认可例外','不增加邮寄规则']},
 {id:'F4',source:concepts,prompt:'用材料例子区分议程设置与框架。',answer:'议程设置就是把失业归因为个人选择；框架就是连续多次突出报道失业。',checklist:['准确指出两概念颠倒','依据两种对应例子','不补造实际效果']},
 {id:'F5',source:policy,prompt:'材料是否证明政策实施后事故减少了50%？',answer:'发展和安全并重，所以实施后事故必然减少50%。',checklist:['规范目标不能证明因果效果','50%没有数据依据','不补造事故统计']},
 {id:'F6',source:policy,prompt:'创新和安全是否必然冲突？可表达有依据的不同观点。',answer:'二者未必冲突。分类分级监管可能给低风险创新留下空间；这是推论，不是材料证明的实施效果。第三条要求发展与安全并重。',checklist:['接受可辩护的非唯一观点','保留可能/推论限定','不强迫唯一正确结论']},
 {id:'F7',source:policy,prompt:'这份材料规定的统一罚款金额是多少？只回答材料能确定的内容。',answer:'所有违规者统一罚款十万元。',checklist:['本节选未覆盖金额','不得凭外部记忆补金额','没有可支持金额的证据时诚实说明']},
 {id:'LONG',title:'个人信息保护法第1至74条（2021年公布文本，完整条文）',source:pipl,sourceUrl:'https://www.miit.gov.cn/jgsj/zfs/fl/art/2022/art_515a4b20c12f430eab54bb4f56d89f56.html',prompt:'仅按所给2021年文本，评价匿名化信息、所有处理是否都需同意、敏感信息保护要求、审计频率、个人家庭事务适用与生效日期这六项判断。不要借用后来的实施规则。',answer:'匿名化后信息仍属于本法个人信息。任何处理都必须取得同意。敏感信息按普通要求即可。合规审计统一每月一次。自然人个人家庭事务也一律适用。本法自2021年8月20日起施行。',checklist:['第4条排除匿名化','第13条存在非同意基础','第28条特定目的充分必要严格保护','第54条定期审计未规定每月','第72条个人家庭事务例外','第74条2021年11月1日生效']},
].map(c=>({...c,title:c.title||c.id+' Pilot验收材料',expected:c.checklist.join('；')}));
