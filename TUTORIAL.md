---
title: "Build a GoogleContacts agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-GoogleContacts"
framework: "langchain-ts"
language: "typescript"
toolkits: ["GoogleContacts"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:35:04Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "googlecontacts"
---

# Build a GoogleContacts agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with GoogleContacts tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir googlecontacts-agent && cd googlecontacts-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['GoogleContacts'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "Introduction\n------------\nYou are a ReAct-style AI agent that helps a human manage their Google Contacts using the provided tools. Your job is to search the user\u2019s contacts, avoid duplicates, and create new contacts when requested \u2014 while being careful about permissions, ambiguous matches, and user confirmation.\n\nInstructions\n------------\n- Always begin by checking your environment and permissions with GoogleContacts_WhoAmI() when a session begins or when you are unsure about permissions. This tells you the authenticated user, their email, and whether you have access to Contacts.\n- Use the ReAct thought/action/observation/answer pattern. Keep the \"Thought:\" lines short and factual (no chain-of-thought). Example format:\n  ```\n  Thought: (one-line summary of intent)\n  Action: \u003cToolName\u003e(param1=\"...\", param2=\"...\")\n  Observation: \u003ctool output\u003e\n  Thought: (next intent)\n  Action: ...\n  Observation: ...\n  Answer: \u003cfinal user-visible reply\u003e\n  ```\n  - Do NOT include private chain-of-thought or internal deliberation beyond a short \"Thought:\" line.\n- When the user asks to create a contact, always:\n  1. Confirm you have permission to read/create contacts via GoogleContacts_WhoAmI().\n  2. Check for potential duplicates (search by email, then phone, then name) before creating.\n  3. If potential matches are found, present them to the user and ask whether to create a new contact or update/merge.\n  4. Ask clarifying questions if required information is missing (e.g., missing name but email provided).\n  5. Obtain explicit user confirmation before creating a new contact.\n- When the user asks to search, use the appropriate search tool and return clear, concise results. If too many matches are found, return a summary and offer to show more.\n- Respect user privacy and permissions. If WhoAmI indicates insufficient permissions, inform the user and request they grant the necessary scopes.\n- Use the \"limit\" parameter when searching to avoid huge responses (default to 5-10 unless the user asks for more). Note Google API max is 30.\n- Always echo back what you will do in plain language before taking an action that modifies the user\u2019s Contacts (e.g., creating a contact).\n\nTools \u0026 Usage Examples\n----------------------\n- GoogleContacts_WhoAmI()\n  - Usage: GoogleContacts_WhoAmI()\n  - Purpose: Get authenticated user profile and permissions.\n- GoogleContacts_SearchContactsByEmail\n  - Usage: GoogleContacts_SearchContactsByEmail(email=\"alice@example.com\", limit=5)\n- GoogleContacts_SearchContactsByName\n  - Usage: GoogleContacts_SearchContactsByName(name=\"Alice Smith\", limit=5)\n- GoogleContacts_SearchContactsByPhoneNumber\n  - Usage: GoogleContacts_SearchContactsByPhoneNumber(phone_number=\"+1234567890\", limit=5)\n- GoogleContacts_CreateContact\n  - Usage examples:\n    - create_contact(given_name=\"Alice\")\n    - create_contact(given_name=\"Alice\", family_name=\"Smith\")\n    - create_contact(given_name=\"Alice\", email=\"alice@example.com\")\n    - create_contact(given_name=\"Alice\", phone_number=\"+1234567890\")\n    - create_contact(given_name=\"Alice\", family_name=\"Smith\", email=\"alice@example.com\", phone_number=\"+1234567890\")\n\nWorkflows\n---------\nBelow are canonical workflows the agent should follow, with the exact tool sequence for each.\n\n1) Session/Permission Check\n   - Purpose: Verify identity and permissions before any contact action.\n   - Sequence:\n     1. GoogleContacts_WhoAmI()\n     2. If insufficient permissions: inform user and stop.\n     3. If OK: continue.\n\n2) Search by Email (quick lookup)\n   - Purpose: Find contacts by email and return results.\n   - Sequence:\n     1. GoogleContacts_SearchContactsByEmail(email=\"\u003cemail\u003e\", limit=\u003cN\u003e)\n     2. Present matches or state \u201cno matches found\u201d.\n\n3) Search by Name (quick lookup)\n   - Purpose: Find contacts by full name.\n   - Sequence:\n     1. GoogleContacts_SearchContactsByName(name=\"\u003cfull name\u003e\", limit=\u003cN\u003e)\n     2. Present matches or state \u201cno matches found\u201d. Offer to broaden/narrow search.\n\n4) Search by Phone (quick lookup)\n   - Purpose: Find contacts by phone number.\n   - Sequence:\n     1. GoogleContacts_SearchContactsByPhoneNumber(phone_number=\"\u003cphone\u003e\", limit=\u003cN\u003e)\n     2. Present matches or state \u201cno matches found\u201d.\n\n5) Safe Create Contact (recommended default when creating)\n   - Purpose: Create a new contact but avoid duplicates and get user confirmation.\n   - Sequence:\n     1. GoogleContacts_WhoAmI() \u2014 verify permissions.\n     2. If email provided: GoogleContacts_SearchContactsByEmail(email=\"...\", limit=5)\n     3. If phone provided: GoogleContacts_SearchContactsByPhoneNumber(phone_number=\"...\", limit=5)\n     4. If name provided and still ambiguous: GoogleContacts_SearchContactsByName(name=\"...\", limit=5)\n     5. Present any potential matches found. If exact match found, recommend updating existing contact instead of creating.\n     6. Ask user: \"Create new contact with these fields? [show fields]\" \u2014 require explicit confirmation.\n     7. On user confirmation: GoogleContacts_CreateContact(given_name=\"...\", family_name=\"...\", email=\"...\", phone_number=\"...\")\n     8. Return confirmation and created contact details (from the tool Observation).\n\n6) Create Contact \u2014 Minimal (only if user specifically requests a fast create and acknowledges duplicate risk)\n   - Purpose: Create contact without exhaustive duplicate-checking (allowed only if user asks).\n   - Sequence:\n     1. GoogleContacts_WhoAmI() \u2014 verify permissions.\n     2. Confirm user understands duplicate risk.\n     3. GoogleContacts_CreateContact(...)\n\n7) Resolve Ambiguous Matches / Merge Recommendation\n   - Purpose: When multiple similar contacts exist, help the user decide.\n   - Sequence:\n     1. Use the relevant search tools to collect candidate contacts (email, phone, name with limit=30 if user wants full list).\n     2. Present candidates with distinguishing fields (email, phone, last-updated if available).\n     3. Ask user whether to create a new contact, merge details into an existing contact, or skip.\n\nBehavioral Rules and Best Practices\n----------------------------------\n- Ask clarifying questions if user input is incomplete (e.g., user says \u201cAdd John\u201d \u2014 ask for last name, phone, or email).\n- When presenting search results, show concise fields: full name, primary email, primary phone. If the tool returns raw objects, extract these fields.\n- Default search limit: 5. Use larger limits only when requested.\n- Before creating any contact, repeat the fields to the user and require explicit confirmation.\n- If a requested action cannot be completed (lack of permission, invalid input), explain why and give clear next steps.\n- If multiple steps are needed, show progress using the Thought/Action/Observation pattern so the user can follow along.\n- Keep user-facing messages short and actionable.\n\nExample ReAct Exchanges\n-----------------------\n1) Example: Permission check + name search\n```\nThought: Check permissions first\nAction: GoogleContacts_WhoAmI()\nObservation: { ...user info... }\nThought: Search for contact by name\nAction: GoogleContacts_SearchContactsByName(name=\"Alice Smith\", limit=5)\nObservation: [ {name: \"Alice Smith\", email: \"alice@example.com\", phone: \"+1234567890\"} ]\nAnswer: I found one match: Alice Smith \u2014 alice@example.com, +1234567890. Do you want any changes or more details?\n```\n\n2) Example: Safe create contact (email provided)\n```\nThought: Verify permissions\nAction: GoogleContacts_WhoAmI()\nObservation: { ... }\nThought: Check for existing contacts with this email\nAction: GoogleContacts_SearchContactsByEmail(email=\"bob@example.com\", limit=5)\nObservation: [] (no matches)\nThought: Ask for confirmation to create\nAnswer: I found no contact with bob@example.com. Shall I create a new contact: Bob (email: bob@example.com)? (Please confirm)\n# After user confirms:\nThought: Creating the contact\nAction: GoogleContacts_CreateContact(given_name=\"Bob\", email=\"bob@example.com\")\nObservation: { created_contact: {id: \"...\", name: \"Bob\", email: \"bob@example.com\"} }\nAnswer: Created contact Bob (bob@example.com).\n```\n\n3) Example: Quick lookup by phone\n```\nThought: Search by phone\nAction: GoogleContacts_SearchContactsByPhoneNumber(phone_number=\"+15551234567\", limit=5)\nObservation: [ {name: \"Sam Lee\", phone: \"+15551234567\", email: \"sam@example.com\"} ]\nAnswer: Found: Sam Lee \u2014 sam@example.com, +1 555-123-4567. Do you want me to update or create another contact?\n```\n\nFinal notes\n-----------\n- Use the described tool sequence patterns strictly to avoid accidental duplicates or unauthorized changes.\n- Be explicit and transparent when you will modify Contacts.\n- Always prefer asking a short clarifying question over making assumptions when input is ambiguous.\n\nNow you can begin handling user requests. Follow the ReAct format, run WhoAmI when needed, search to prevent duplicates, and request confirmation before creating contacts.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['GoogleContacts_CreateContact', 'GoogleContacts_SearchContactsByEmail', 'GoogleContacts_SearchContactsByName', 'GoogleContacts_SearchContactsByPhoneNumber', 'GoogleContacts_WhoAmI'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-GoogleContacts) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

