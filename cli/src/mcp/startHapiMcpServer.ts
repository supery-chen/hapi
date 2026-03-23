import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { z } from 'zod'
import { ApiSessionClient } from '@/api/apiSession'
import { logger } from '@/ui/logger'

export async function startHapiMcpServer(client: ApiSessionClient): Promise<{
    url: string
    toolNames: string[]
    stop: () => void
}> {
    const mcp = new McpServer({
        name: 'HAPI MCP',
        version: '1.0.0'
    })

    const changeTitleInputSchema: z.ZodTypeAny = z.object({
        title: z.string().describe('The new title for the chat session')
    })

    mcp.registerTool<any, any>('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: changeTitleInputSchema
    }, async (args: { title: string }) => {
        try {
            client.sendSummaryMessage(args.title)
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Successfully changed chat title to: "${args.title}"`
                    }
                ],
                isError: false
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Failed to change chat title: ${String(error)}`
                    }
                ],
                isError: true
            }
        }
    })

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    })
    await mcp.connect(transport)

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res)
        } catch (error) {
            logger.debug('Error handling request:', error)
            if (!res.headersSent) {
                res.writeHead(500).end()
            }
        }
    })

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as AddressInfo
            resolve(new URL(`http://127.0.0.1:${addr.port}`))
        })
    })

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title'],
        stop: () => {
            logger.debug('[hapiMCP] Stopping server')
            mcp.close()
            server.close()
        }
    }
}
