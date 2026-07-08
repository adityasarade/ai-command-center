import Link from 'next/link';
import { CodeBlock } from '../../components/CodeBlock';
import { CodeTabs } from '../../components/Tabs';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Integrate a project' };

const OPENAI = [
  {
    label: 'Python',
    lang: 'python',
    code: `from openai import OpenAI
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")`,
  },
  {
    label: 'JS / TS',
    lang: 'js',
    code: `import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://localhost:4321/p/invoice-bot/openai/v1" });`,
  },
  {
    label: 'Java',
    lang: 'java',
    code: `OpenAIClient client = OpenAIOkHttpClient.builder()
    .fromEnv()
    .baseUrl("http://localhost:4321/p/invoice-bot/openai/v1")
    .build();`,
  },
  {
    label: 'env var',
    lang: 'bash',
    code: `export OPENAI_BASE_URL="http://localhost:4321/p/invoice-bot/openai/v1"`,
  },
  {
    label: 'LangChain',
    lang: 'python',
    code: `from langchain_openai import ChatOpenAI
llm = ChatOpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")`,
  },
];

export default function Page() {
  return (
    <>
      <h1>Integrate a project</h1>
      <p className="lead">
        Integration is a base-URL change. Your API keys never move, and nothing else about your code
        changes. The <code>/p/&lt;project&gt;</code> segment is how calls are grouped on the
        dashboard.
      </p>

      <h2>The pattern</h2>
      <p>Every gateway route looks like one of these:</p>
      <CodeBlock
        lang="text"
        label="routes"
        code={`http://localhost:4321/p/<project>/openai/v1        →  api.openai.com
http://localhost:4321/p/<project>/anthropic        →  api.anthropic.com
http://localhost:4321/p/<project>/gemini           →  generativelanguage.googleapis.com
# also: openrouter, mistral, deepseek, xai, groq, together, ollama, + custom`}
      />
      <p>
        Prefer not to touch the URL in code? Set the SDK&apos;s standard base-URL env var instead (
        <code>OPENAI_BASE_URL</code>, <code>ANTHROPIC_BASE_URL</code>,
        <code> GOOGLE_GEMINI_BASE_URL</code>) and change nothing else.
      </p>

      <h2>OpenAI (and OpenAI-compatible)</h2>
      <CodeTabs items={OPENAI} />

      <h2>Anthropic</h2>
      <CodeBlock
        lang="python"
        code={`from anthropic import Anthropic
client = Anthropic(base_url="http://localhost:4321/p/invoice-bot/anthropic")`}
      />

      <h2>Google Gemini</h2>
      <CodeBlock
        lang="python"
        code={`from google import genai
client = genai.Client(http_options={"base_url": "http://localhost:4321/p/invoice-bot/gemini"})`}
      />

      <h2>Optional thin SDKs</h2>
      <p>
        They do nothing but set those env vars for you - use them or skip them. Install with{' '}
        <code>pip install aicc-sdk</code> or <code>npm install @ai-command-center/sdk</code>.
      </p>
      <CodeBlock
        lang="python"
        code={`import aicc
aicc.init(project="invoice-bot")   # before you construct any client`}
      />
      <CodeBlock
        lang="js"
        code={`import { init } from "@ai-command-center/sdk";
init({ project: "support-bot" });`}
      />

      <h2>Batch jobs &amp; unsupported providers</h2>
      <p>
        Can&apos;t route through the proxy? Report usage directly and it&apos;s priced and
        dashboarded the same way:
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -X POST http://localhost:4321/api/track \\
  -H "Content-Type: application/json" \\
  -d '{"project":"nightly-job","provider":"openai","model":"gpt-4o","tokensIn":52000,"tokensOut":9000}'`}
      />

      <h2>Grouping without a path prefix</h2>
      <p>
        If you can&apos;t change the path, send a header instead:{' '}
        <code>x-aicc-project: invoice-bot</code>.
      </p>

      <h2>Traces &amp; prompt versions</h2>
      <p>
        Two more optional headers unlock the Traces and Prompts views: <code>x-aicc-trace</code> (a
        shared id across the calls in one request or agent run) and <code>x-aicc-prompt</code> /{' '}
        <code>x-aicc-prompt-version</code>. Full details in{' '}
        <Link href="/docs/features">Traces, prompts &amp; budgets</Link>.
      </p>

      <div className="callout">
        With <Link href="/docs/auth">auth enabled</Link>, the <code>/p/&lt;project&gt;</code>{' '}
        segment becomes
        <code> /k/&lt;gateway-key&gt;</code> - the key both authenticates the call and assigns its
        project. Run <code>npx ai-command-center snippets --project &lt;name&gt;</code> to print the
        exact URLs with the key filled in.
      </div>

      <DocFoot />
    </>
  );
}
