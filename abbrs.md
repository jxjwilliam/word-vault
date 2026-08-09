# AI / ML / Software Engineering Glossary (EN ↔ 中文)

### 🔤 AI 核心术语 (ai)

| English Term | Chinese Translation |
| --- | --- |
| perceive | 感知 |
| intervention | 干预 |
| inference | 推断 |
| reasoning | 推理 |
| ReAct (Reason + Act) | 交互式推理与行动 |
| curate / curated | 策划 / 精选 |
| augment | 增强 |
| agentic | 能动性 / 代理式 |
| agent | 智能体 |
| agentic AI | 能动式人工智能 |
| autonomy | 自主性 |
| goal-driven | 目标驱动 |
| workflow | 工作流 |
| multi-agent | 多智能体 |
| multi-agent collaboration | 多智能体协作 |
| orchestration | 编排 |
| orchestrator | 编排器 |
| planner | 规划器 |
| executor / actor | 执行器 |
| observer | 观察器 |
| feedback loop | 反馈循环 |
| tool calling / tool use | 工具调用 |
| function calling | 函数调用 |
| hallucination | 幻觉 |
| grounding | 知识锚定 |
| state | 状态 |
| state machine | 状态机 |
| decision making | 决策 |
| planning | 规划 |
| execution | 执行 |
| observation | 观察 |
| environment | 环境 |
| policy | 策略 |
| harnesses | 利用 / 框架支持 |
| tradeoff / trade-off | 权衡 |
| calibration | 校准 |
| verification | 验证 |
| constraint | 约束 |
| cleanup | 清理 |
| hypothesis | 假设 |
| ingest / parse / extract / validate / reconcile | 摄取 / 解析 / 提取 / 验证 / 调和 |
| canonical (canonical semantic representation) | 规范的（规范语义表示） |
| **skill (agent skill)** | **技能（可复用能力模块）** |
| **subagent** | **子智能体** |
| **agent loop** | **智能体循环（感知-决策-行动）** |
| **sandbox / sandboxing** | **沙箱 / 沙箱隔离** |
| **computer use** | **计算机操作能力（模型直接操作 GUI）** |
| **task decomposition** | **任务分解** |
| **self-reflection / self-critique** | **自我反思 / 自我批判** |
| **plan-and-execute** | **先规划后执行** |
| **long-horizon task** | **长周期任务** |
| **human-in-the-loop (HITL)** | **人类参与回路** |
| **guardrail** | **护栏（约束模型行为的规则层）** |
| safety | 安全性 |
| auditable | 可审计的 |
| validation | 验证 |
| reliability | 可靠性 |
| trustworthy | 可信的 |
| traceability | 可追溯性 |
| deterministic behavior | 确定性行为 |
| failure tolerance | 容错性 |
| observability | 可观测性 |
| guardrail | 护栏 |
| correction rate | 纠错率 |
| accuracy, rollout, iteration | 准确性、推广、迭代 |
| retrieval, reasoning, and presentation | 检索、推理、呈现 |
| confidence levels, citations, and user review | 置信度、引用、用户评价 |
| sentiment analysis | 情感分析 |
| best trade-off | 最佳权衡 |
| **eval / evals (evaluation suite)** | **评估集 / 评测套件** |
| **benchmark** | **基准测试** |
| **red teaming** | **红队测试（对抗性安全测试）** |
| **bias & fairness** | **偏见与公平性** |
| **interpretability** | **可解释性** |
| **explainability (XAI)** | **可解释人工智能** |
| **regression testing (model regression)** | **模型回归测试** |
| **golden dataset** | **黄金标准数据集** |
| **human evaluation** | **人工评估** |
| **LLM-as-judge** | **以大模型作为评判者** |
| **drift (data / model drift)** | **数据漂移 / 模型漂移** |

Acronym quick reference — English (Chinese)

| English Term | Chinese Translation |
| --- | --- |
| LLM (Large Language Model) | 大语言模型 |
| RAG (Retrieval-Augmented Generation) | 检索增强生成 |
| SFT (Supervised Fine-Tuning) | 监督微调 |
| RLHF (Reinforcement Learning from Human Feedback) | 基于人类反馈的强化学习 |
| DPO (Direct Preference Optimization) | 直接偏好优化 |
| PPO (Proximal Policy Optimization) | 近端策略优化 |
| GRPO (Group Relative Policy Optimization) | 组相对策略优化 |
| LoRA (Low-Rank Adaptation) | 低秩适配 |
| QLoRA (Quantized LoRA) | 量化低秩适配 |
| PEFT (Parameter-Efficient Fine-Tuning) | 参数高效微调 |
| MoE (Mixture of Experts) | 混合专家模型 |
| KV cache (Key-Value Cache) | 键值缓存 |
| TTFT (Time To First Token) | 首 token 延迟 |
| TPS (Tokens Per Second) | 每秒 token 数 |
| CoT (Chain of Thought) | 思维链 |
| ToT (Tree of Thought) | 思维树 |
| ReAct (Reason + Act) | 推理与行动 |
| MCP (Model Context Protocol) | 模型上下文协议 |
| VLM (Vision-Language Model) | 视觉语言模型 |
| ANN (Approximate Nearest Neighbor) | 近似最近邻 |
| HNSW (Hierarchical Navigable Small World) | 分层可导航小世界索引 |
| XAI (Explainable AI) | 可解释人工智能 |
| MLOps (Machine Learning Operations) | 机器学习运维 |
| ETA (Estimated Time of Arrival) | 预计到达时间 |
| EDD (Estimated Delivery Date) | 预计交付日期 |
| GAN (Generative Adversarial Network) | 生成对抗网络 |
| ASR (Automatic Speech Recognition) | 自动语音识别 |
| TTS (Text-to-Speech) | 文本转语音 |
| CI/CD (Continuous Integration / Continuous Delivery) | 持续集成/持续交付 |

### 📚 RAG 与数据 (ai)

| English Term | Chinese Translation |
| --- | --- |
| RAG (Retrieval-Augmented Generation) | 检索增强生成 |
| retrieval | 检索 |
| augmentation | 增强 |
| knowledge base | 知识库 |
| ingestion | 数据摄取 |
| chunking | 分块 |
| embedding | 向量嵌入 |
| embedding model | 向量嵌入模型 |
| vector | 向量 |
| vector database | 向量数据库 |
| similarity search | 相似度搜索 |
| hybrid search | 混合搜索 |
| sparse-dense hybrid search | 稀疏-密集混合搜索 |
| re-ranking / reranker | 重排序 / 重排模型 |
| top-K | 前 K 个 |
| metadata | 元数据 |
| document parsing | 文档解析 |
| data curation | 数据策划 |
| noise | 噪声 |
| redundancy | 冗余 |
| compression | 压缩 |
| relevance | 相关性 |
| source of truth | 事实来源 |
| distill-wiki-pipeline | 维基蒸馏管道 |
| weaver | 编织器（多源信息整合模块） |
| pristine | 原始纯净的 / 完好无损的 |
| stale | 陈旧的 / 过期的 |
| sanity check | 合理性检查 / 基本健全性检查 |
| verdict | 结论 / 判定 |
| evolving thesis | 演化中的论点 / 持续发展的主张 |
| **cosine similarity** | **余弦相似度** |
| **HNSW (Hierarchical Navigable Small World)** | **分层可导航小世界（向量索引算法）** |
| **ANN (Approximate Nearest Neighbor)** | **近似最近邻搜索** |
| **RAG-Fusion** | **融合式检索增强生成** |
| **GraphRAG** | **图检索增强生成** |
| **agentic RAG** | **智能体式检索增强生成** |
| **contextual retrieval** | **上下文感知检索** |
| **query rewriting / query expansion** | **查询重写 / 查询扩展** |
| **document store** | **文档存储** |
| **indexing** | **建立索引** |
| **semantic cache** | **语义缓存** |
| **data pipeline** | **数据管道** |
| **ETL (Extract, Transform, Load)** | **抽取-转换-加载** |
| **freshness (data freshness)** | **数据新鲜度** |

### 🤖 LLM 与 Agent 进阶 (ai)

| English Term | Chinese Translation |
| --- | --- |
| fine-tuning | 微调 |
| instruction tuning | 指令微调 |
| zero-shot | 零样本 |
| few-shot | 少样本 |
| chain of thought (CoT) | 思维链 |
| reasoning model | 推理模型 |
| corpus | 语料库 |
| collator | 整理器 / 数据整理器 |
| logits | 逻辑输出 / logits |
| hyperparameters | 超参数 |
| reinforcement (learning) | 强化（学习） |
| alignment | 对齐 |
| lineage of trained models | 训练模型的谱系 |
| **RLHF (Reinforcement Learning from Human Feedback)** | **基于人类反馈的强化学习** |
| **RLAIF (RL from AI Feedback)** | **基于 AI 反馈的强化学习** |
| **DPO (Direct Preference Optimization)** | **直接偏好优化** |
| **PPO (Proximal Policy Optimization)** | **近端策略优化** |
| **GRPO (Group Relative Policy Optimization)** | **组相对策略优化** |
| **SFT (Supervised Fine-Tuning)** | **监督微调** |
| **LoRA (Low-Rank Adaptation)** | **低秩适配（参数高效微调）** |
| **QLoRA** | **量化低秩适配** |
| **PEFT (Parameter-Efficient Fine-Tuning)** | **参数高效微调** |
| **reward model** | **奖励模型** |
| **reward hacking** | **奖励作弊 / 奖励破解** |
| **preference data** | **偏好数据** |
| **distillation (knowledge distillation)** | **知识蒸馏** |
| **teacher-student model** | **师生模型（蒸馏范式）** |
| **pretraining** | **预训练** |
| **post-training** | **后训练** |
| **continual learning** | **持续学习** |
| **catastrophic forgetting** | **灾难性遗忘** |
| **synthetic data** | **合成数据** |
| **data contamination** | **数据污染（测试集泄漏）** |
| **scaling law** | **缩放定律** |
| **emergent ability** | **涌现能力** |
| **test-time compute / inference-time scaling** | **测试时计算 / 推理时扩展** |
| **curriculum learning** | **课程学习** |
| large language model (LLM) | 大语言模型 |
| foundation model | 基础模型 |
| latency | 延迟 |
| throughput | 吞吐量 |
| cost efficiency | 成本效率 |
| scalability | 可扩展性 |
| inference time | 推理时间 |
| on-premise | 本地部署 |
| data sovereignty | 数据主权 |
| open-source model | 开源模型 |
| proprietary model | 专有模型 |
| **KV cache (Key-Value cache)** | **键值缓存（加速自回归推理）** |
| **quantization** | **量化** |
| **INT8 / INT4 / FP8** | **8位/4位整数量化、8位浮点量化** |
| **speculative decoding** | **投机解码** |
| **batching / continuous batching** | **批处理 / 连续批处理** |
| **MoE (Mixture of Experts)** | **混合专家模型** |
| **sparse activation** | **稀疏激活** |
| **TTFT (Time To First Token)** | **首 token 延迟** |
| **TPS (Tokens Per Second)** | **每秒生成 token 数** |
| **context caching / prompt caching** | **上下文缓存 / 提示词缓存** |
| **model serving** | **模型服务化部署** |
| **model router** | **模型路由器（按任务分流不同模型）** |
| **edge inference** | **边缘端推理** |
| **model compression** | **模型压缩** |
| **pruning** | **剪枝** |
| **tensor parallelism** | **张量并行** |
| **pipeline parallelism** | **流水线并行** |
| **data parallelism** | **数据并行** |
| context | 上下文 |
| context window | 上下文窗口 |
| context engineering | 上下文工程 |
| prompt | 提示词 |
| prompt engineering | 提示词工程 |
| system prompt | 系统提示 |
| memory | 记忆 |
| long-term memory | 长期记忆 |
| short-term memory | 短期记忆 |
| clearly and crisply | 清晰简洁地 |
| **few-shot prompting** | **少样本提示** |
| **zero-shot prompting** | **零样本提示** |
| **chain-of-thought prompting** | **思维链提示** |
| **ToT (Tree of Thought)** | **思维树** |
| **self-consistency** | **自一致性（多路径投票）** |
| **structured output / JSON mode** | **结构化输出 / JSON 模式** |
| **MCP (Model Context Protocol)** | **模型上下文协议** |
| **context rot / context degradation** | **上下文衰减 / 长上下文性能退化** |
| **context compaction / summarization** | **上下文压缩 / 摘要** |
| **system-user-assistant roles** | **系统-用户-助手角色分工** |
| **token budget** | **token 预算** |
| **prompt injection** | **提示词注入（安全风险）** |
| **jailbreak** | **越狱（绕过安全限制）** |
| **multimodal** | **多模态** |
| **VLM (Vision-Language Model)** | **视觉语言模型** |
| **diffusion model** | **扩散模型** |
| **autoregressive model** | **自回归模型** |
| **world model** | **世界模型** |
| **tokenizer** | **分词器** |
| **latent space** | **潜空间** |
| **cross-modal alignment** | **跨模态对齐** |
| **image captioning** | **图像描述生成** |
| **text-to-speech (TTS)** | **文本转语音** |
| **speech-to-text (STT / ASR)** | **语音转文本 / 自动语音识别** |
| **generative adversarial network (GAN)** | **生成对抗网络** |
| **transformer** | **变换器（Transformer 架构）** |
| **attention mechanism** | **注意力机制** |
| **self-attention** | **自注意力** |
| excalidraw diagram | 示例图（架构草图） |
| **MLOps** | **机器学习运维** |
| **LLMOps** | **大模型运维** |
| **CI/CD** | **持续集成 / 持续交付** |
| **feature store** | **特征存储** |
| **model registry** | **模型注册表** |
| **experiment tracking** | **实验追踪** |
| **A/B testing** | **A/B 测试** |
| **canary deployment** | **金丝雀发布** |
| **rollback** | **回滚** |
| **rate limiting** | **限流** |
| **autoscaling** | **自动扩缩容** |
| **GPU utilization** | **GPU 利用率** |
| **cold start** | **冷启动** |
| **ETA (Estimated Time of Arrival)** | **预计到达/完成时间** |
| **EDD (Estimated Delivery Date)** | **预计交付日期** |
| tool use | 工具使用 |
| function calling | 函数调用 |
| token | 词元 |
| tokenizer | 分词器 |
| temperature | 温度参数 |
| sampling | 采样 |
| streaming | 流式输出 |
| fine-tuning | 微调 |
| RLHF | 人类反馈强化学习 |
| distillation | 知识蒸馏 |
| quantization | 量化 |
| chain-of-thought | 思维链 |
| latent space | 潜空间 |
| multi-agent | 多智能体系统 |
| guardrails | 安全护栏 |

### 💻 编程概念 (programming)

| English Term | Chinese Translation |
| --- | --- |
| **idempotent / idempotency** | **幂等 / 幂等性** |
| **backpressure** | **背压** |
| **eventual consistency** | **最终一致性** |
| **race condition** | **竞态条件** |
| **concurrency vs parallelism** | **并发 vs 并行** |
| **thread safety** | **线程安全** |
| **memoization** | **记忆化（缓存函数结果）** |
| **circuit breaker** | **熔断器** |
| **retry with exponential backoff** | **指数退避重试** |
| **dependency injection** | **依赖注入** |
| **middleware** | **中间件** |
| **serialization / deserialization** | **序列化 / 反序列化** |
| **schema validation** | **模式校验** |
| **type hint** | **类型提示** |
| **immutability** | **不可变性** |
| **stateless / stateful** | **无状态 / 有状态** |
| idempotent | 幂等 |
| async / await | 异步 / 等待 |
| callback | 回调 |
| closure | 闭包 |
| recursion | 递归 |
| memoization | 记忆化 |
| concurrency | 并发 |
| parallelism | 并行 |
| race condition | 竞态条件 |
| deadlock | 死锁 |
| serialization | 序列化 |
| sharding | 分片 |
| cursor | 游标 |
| namespace | 命名空间 |
| polymorphism | 多态 |
| encapsulation | 封装 |

### ⚙️ 开发流程与工具 (programming)

| English Term | Chinese Translation |
| --- | --- |
| linter | 静态检查器 |
| bundler | 打包器 |
| transpiler | 转译器 |
| polyfill | 垫片 |
| monorepo | 单体仓库 |
| CI / CD | 持续集成 / 持续部署 |
| regression | 回归 |
| smoke test | 冒烟测试 |
| unit test | 单元测试 |
| integration test | 集成测试 |
| code review | 代码评审 |
| hotfix | 热修复 |
| canary release | 金丝雀发布 |
| feature flag | 特性开关 |
| revert | 回滚 |
| pull request | 拉取请求 |

### 🗄️ 数据库与运维 (programming)

| English Term | Chinese Translation |
| --- | --- |
| migration | 数据迁移 |
| index | 索引 |
| transaction | 事务 |
| replication | 复制 |
| failover | 故障转移 |
| schema | 模式 / 架构 |
| cache invalidation | 缓存失效 |
| rate limiting | 限流 |
| circuit breaker | 熔断器 |
| backoff | 退避 |
| health check | 健康检查 |
| load balancer | 负载均衡 |
| zero-downtime | 零停机 |
| observability | 可观测性 |
| tracing | 链路追踪 |

### 🌍 通用阅读 (general)

| English Term | Chinese Translation |
| --- | --- |
| albeit | 尽管 |
| notwithstanding | 尽管 / 仍然 |
| prerequisite | 前提条件 |
| counterpart | 对应物 |
| leverage | 利用 / 杠杆作用 |
| streamline | 精简流程 |
| mitigate | 缓解 |
| assess | 评估 |
| substantial | 大量的 |
| ambiguous | 模糊的 |
| robust | 健壮的 |
| granular | 细粒度的 |
| bottleneck | 瓶颈 |
| overhead | 开销 |
| trade-off | 权衡 |