# Provider integrations

Identifiers and prices are administrator-owned. There are no automatic model downloads, repository execution, arbitrary Python/shell tools or hidden cross-provider credential fallbacks.

| Provider kind | Registered base path | Protocol |
| --- | --- | --- |
| `ollama` | Private runtime `/api` | POST `/chat`, native tool calls, bounded context/output and configurable idle unloading |
| `openai_compatible` | Deployed `/v1` or other compatible base | POST `/chat/completions` with typed function tools |
| `groq` | Approved host `/openai/v1` | Same chat-completions adapter |
| `anthropic` | Approved API `/v1` | POST `/messages`, system separation and tool result conversion |
| `huggingface` | Deployed compatible base | OpenAI-compatible chat completions; repository metadata is separate |

Hugging Face deployments are explicitly `hosted_inference`, `dedicated_endpoint`, `self_hosted` or `repository_only`. `runtime`, repository, revision and quantization are metadata about an existing deployment, not instructions executed by the admin API. A Hub repository does not imply a callable endpoint. Dedicated TGI/vLLM endpoints must actually expose compatible chat and tools; activation requires a successful function-call test. GGUF is supported through an already provisioned compatible runtime such as llama.cpp or Ollama, not by loading weights in Python web workers.

For a downloaded model, an operator/background deployment job must review licensing, pin revision, check storage/RAM and install it before endpoint registration. This change supplies an optional isolated Ollama deployment overlay; it does not implement automated installation or a provisioning control plane. Administrative HTTP requests never download model weights.

The transport validates an operator-owned allowlist, resolves and rejects prohibited addresses, connects to the validated IP, preserves TLS SNI/Host verification, refuses redirects and bounds response size/time. Cloud hosts require HTTPS/443 and globally routable addresses. Local hosts require an exact approved origin and private/loopback resolution. No credentials/query strings/fragments are allowed in URLs. A custom cloud host requires an operator allowlist change; endpoint paths can then be configured by an admin without redeployment.

Adapters normalize usage and tool messages, reject unadvertised tool names and invalid argument JSON, and sanitize malformed upstream responses. Unknown usage or failed dispatched calls retain conservative reservations. Connectivity checks consume the global cloud budget and validate structured tools, not merely an HTTP 200.

Protocol references checked during implementation: [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md) documents native chat tools and `keep_alive`. [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/index) provides an OpenAI-compatible chat interface. [TGI Messages API](https://github.com/huggingface/text-generation-inference/blob/main/docs/source/reference/api_reference.md) describes compatible deployed endpoints. Actual compatibility is still established by the configured endpoint test, not inferred from these product names.
