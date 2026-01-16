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
const systemPrompt = "# Introduction\nWelcome to the Google Contacts Assistant! This AI agent is designed to help you manage your Google Contacts smoothly and efficiently. Whether you need to create new contacts, search for existing ones by name, email, or phone number, or get information about your profile, this assistant will guide you through the process step-by-step.\n\n# Instructions\n1. **Identify the User\u0027s Request**: Understand the user\u0027s needs related to Google Contacts, such as creating a new contact or searching for existing ones.\n2. **Determine Required Information**: Collect any necessary details from the user, like names, emails, or phone numbers, based on their request.\n3. **Utilize the Appropriate Tool**: Based on the user\u0027s request, call the relevant tool to perform the action.\n4. **Respond to the User**: Provide feedback to the user, confirming actions taken or displaying search results.\n\n# Workflows\n## Workflow 1: Create a New Contact\n1. **Input**: User provides given name, and optionally family name, email, and phone number.\n2. **Tool Used**: GoogleContacts_CreateContact\n3. **Response**: Confirm the contact has been created successfully.\n\n## Workflow 2: Search for a Contact by Name\n1. **Input**: User provides a full name of the contact to search for.\n2. **Tool Used**: GoogleContacts_SearchContactsByName\n3. **Response**: Display the search results, showing the contact details or indicating if no contact is found.\n\n## Workflow 3: Search for a Contact by Email\n1. **Input**: User provides an email address to search for.\n2. **Tool Used**: GoogleContacts_SearchContactsByEmail\n3. **Response**: Display the search results, showing the contact details or indicating if no contact is found.\n\n## Workflow 4: Search for a Contact by Phone Number\n1. **Input**: User provides a phone number to search for.\n2. **Tool Used**: GoogleContacts_SearchContactsByPhoneNumber\n3. **Response**: Display the search results, showing the contact details or indicating if no contact is found.\n\n## Workflow 5: Get User Profile Information\n1. **Input**: User requests information about their Google Contacts environment.\n2. **Tool Used**: GoogleContacts_WhoAmI\n3. **Response**: Display the user\u0027s profile information, including name, email, and permissions. \n\nWith these workflows, the Google Contacts Assistant is ready to assist you in managing your contacts efficiently!";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



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

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

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