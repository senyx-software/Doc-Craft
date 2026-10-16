import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();

async function generateTestToken() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "test-secret");
  return new SignJWT({ sub: "test-user-123", email: "test@example.com", type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function main() {
  // We need to pass the JWT in the query string so the EventSource can authenticate
  const token = await generateTestToken();
  const url = new URL(`http://localhost:3012/api/mcp?token=${token}`);

  console.log(`Connecting to MCP Server at ${url.toString().split('?')[0]}...`);

  // Connect to the SSE endpoint we created
  const transport = new SSEClientTransport(url, {
    // Also pass it as a Bearer token for the POST /message endpoint which uses fetch
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("✅ Successfully connected to MCP Server!\n");

    console.log("Fetching available tools...");
    const tools = await client.listTools();

    console.log("✅ Tools discovered:");
    tools.tools.forEach((tool) => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });

    console.log("\n-------------------------------------------");
    console.log("Testing Tool Execution: create_session");
    console.log("-------------------------------------------\n");

    const createResult = await client.callTool({
      name: "create_session",
      arguments: {
        userId: "test-user-123",
        documentTypeId: "test-doc-type-123",
        templateId: "test-template-123"
      }
    });

    console.log("✅ Session created successfully!");
    const sessionText = (createResult.content as { type: string; text: string }[])[0].text;
    console.log(sessionText);
    const session = JSON.parse(sessionText);
    const sessionId = session.id;

    console.log("\n-------------------------------------------");
    console.log("Testing Tool Execution: update_slots");
    console.log("-------------------------------------------\n");

    const updateResult = await client.callTool({
      name: "update_slots",
      arguments: {
        sessionId: sessionId,
        slots: {
          "customer_name": "John Doe",
          "amount": "$500"
        }
      }
    });

    console.log("✅ Slots updated successfully!");
    console.log((updateResult.content as { type: string; text: string }[])[0].text);

    console.log("\n-------------------------------------------");
    console.log("Testing Tool Execution: complete_session");
    console.log("-------------------------------------------\n");

    const completeResult = await client.callTool({
      name: "complete_session",
      arguments: {
        sessionId: sessionId
      }
    });

    console.log("✅ Session completed successfully!");
    console.log((completeResult.content as { type: string; text: string }[])[0].text);

    console.log("\nTesting complete! Exiting...");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to connect or fetch tools:", error);
    process.exit(1);
  }
}

main();
