# Java integration

No special SDK needed - point any OpenAI-compatible client at the gateway.

## Official `openai-java`

```java
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.chat.completions.ChatCompletionCreateParams;

OpenAIClient client = OpenAIOkHttpClient.builder()
    .fromEnv() // reads OPENAI_API_KEY as usual
    .baseUrl("http://localhost:4321/p/java-demo/openai/v1")
    .build();

ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
    .model("gpt-4o-mini")
    .addUserMessage("Say hello from AI Command Center in 5 words.")
    .build();

System.out.println(client.chat().completions().create(params));
```

Or zero code changes - the official SDK honors the standard env var:

```bash
export OPENAI_BASE_URL="http://localhost:4321/p/java-demo/openai/v1"
java -jar your-app.jar
```

## Spring AI

```properties
spring.ai.openai.base-url=http://localhost:4321/p/java-demo/openai
```

## LangChain4j

```java
OpenAiChatModel model = OpenAiChatModel.builder()
    .apiKey(System.getenv("OPENAI_API_KEY"))
    .baseUrl("http://localhost:4321/p/java-demo/openai/v1")
    .build();
```

Every call now shows up on the dashboard at http://localhost:4321 with tokens,
cost, and latency - grouped under the `java-demo` project.
