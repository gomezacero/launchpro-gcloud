/**
 * LaunchPro Agent System - Base Agent
 * 
 * Esta es la clase base que implementa el "agentic loop" - el patrón core
 * que permite a los agentes razonar, usar herramientas, y iterar hasta
 * completar su objetivo.
 * 
 * AGENTIC LOOP:
 * 1. Recibir objetivo
 * 2. Pensar qué hacer
 * 3. Decidir si usar una herramienta o dar respuesta final
 * 4. Si usa herramienta → ejecutar → volver a paso 2
 * 5. Si da respuesta final → terminar
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  Tool,
  ToolResult,
  AgentState,
  AgentStep,
  AgentConfig,
  AgentMessage
} from './types';

export abstract class BaseAgent {
  protected anthropic: Anthropic;
  protected config: AgentConfig;
  protected state: AgentState;
  protected toolHandlers: Map<string, (input: any) => Promise<ToolResult>>;

  constructor(config: Partial<AgentConfig> = {}) {
    // Use process.env directly to avoid module caching issues
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropic = new Anthropic({
      apiKey: anthropicKey,
    });

    if (!anthropicKey) {
      console.warn('[BaseAgent] ⚠️ WARNING: ANTHROPIC_API_KEY not found');
    }
    
    this.config = {
      model: config.model || 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
      maxIterations: config.maxIterations || 10,
      systemPrompt: config.systemPrompt || '',
      tools: config.tools || [],
    };
    
    this.state = {
      status: 'idle',
      currentStep: '',
      steps: [],
      iterations: 0,
      maxIterations: this.config.maxIterations,
    };
    
    this.toolHandlers = new Map();
  }
  
  /**
   * Registrar un handler para una herramienta
   */
  protected registerTool(name: string, handler: (input: any) => Promise<ToolResult>): void {
    this.toolHandlers.set(name, handler);
  }
  
  /**
   * Ejecutar una herramienta
   */
  protected async executeTool(name: string, input: any): Promise<ToolResult> {
    const handler = this.toolHandlers.get(name);
    
    if (!handler) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }
    
    try {
      const result = await handler(input);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Agregar un paso al historial
   */
  protected addStep(step: Omit<AgentStep, 'timestamp'>): void {
    this.state.steps.push({
      ...step,
      timestamp: new Date(),
    });
  }
  
  /**
   * Log con formato para debugging
   */
  protected log(message: string, data?: any): void {
    const prefix = `[${this.constructor.name}]`;
    console.log(`${prefix} ${message}`, data || '');
  }
  
  /**
   * EL AGENTIC LOOP - El corazón del agente
   * 
   * Este método implementa el ciclo principal donde el agente:
   * 1. Piensa
   * 2. Decide usar herramienta o responder
   * 3. Si usa herramienta, procesa resultado y vuelve a pensar
   * 4. Repite hasta completar o alcanzar max iteraciones
   */
  async run(userMessage: string): Promise<{ success: boolean; result?: any; error?: string }> {
    this.state.status = 'thinking';
    this.state.iterations = 0;
    
    // Inicializar mensajes con el mensaje del usuario
    const messages: AgentMessage[] = [
      { role: 'user', content: userMessage }
    ];
    
    this.log('🚀 Starting agent run', { userMessage: userMessage.substring(0, 100) + '...' });
    
    try {
      while (this.state.iterations < this.config.maxIterations) {
        this.state.iterations++;
        this.log(`📍 Iteration ${this.state.iterations}/${this.config.maxIterations}`);
        
        // Llamar a Claude con las herramientas disponibles
        const response = await this.anthropic.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: this.config.systemPrompt,
          tools: this.config.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
          })),
          messages,
        });
        
        // Procesar la respuesta
        const { stopReason, contentBlocks } = this.parseResponse(response);
        
        this.log('📨 Response received', { stopReason, blocksCount: contentBlocks.length });
        
        // Verificar si terminó
        if (stopReason === 'end_turn') {
          // El agente decidió terminar - extraer respuesta final
          const textContent = contentBlocks.find(b => b.type === 'text');
          
          if (textContent && textContent.type === 'text') {
            this.addStep({
              type: 'output',
              content: textContent.text,
            });
            
            this.state.status = 'completed';
            this.log('✅ Agent completed successfully');
            
            // Intentar parsear como JSON si es posible
            try {
              const parsed = JSON.parse(textContent.text);
              return { success: true, result: parsed };
            } catch {
              return { success: true, result: textContent.text };
            }
          }
        }
        
        // Si hay tool_use, ejecutar las herramientas
        if (stopReason === 'tool_use') {
          const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');
          
          // Agregar la respuesta del asistente a los mensajes
          messages.push({
            role: 'assistant',
            content: contentBlocks,
          });
          
          // Ejecutar cada herramienta y recopilar resultados
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          
          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.type === 'tool_use') {
              this.state.status = 'using_tool';
              this.state.currentStep = `Using tool: ${toolBlock.name}`;
              
              this.log(`🔧 Executing tool: ${toolBlock.name}`, toolBlock.input);
              
              this.addStep({
                type: 'tool_use',
                content: `Calling ${toolBlock.name}`,
                toolName: toolBlock.name,
                toolInput: toolBlock.input,
              });
              
              // Ejecutar la herramienta
              const result = await this.executeTool(toolBlock.name, toolBlock.input);
              
              this.log(`📦 Tool result for ${toolBlock.name}:`, { success: result.success });
              
              this.addStep({
                type: 'tool_result',
                content: JSON.stringify(result),
                toolName: toolBlock.name,
                toolResult: result,
              });
              
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
              });
            }
          }
          
          // Agregar resultados de herramientas a los mensajes
          messages.push({
            role: 'user',
            content: toolResults,
          });
          
          this.state.status = 'thinking';
          continue;
        }
        
        // Si llegamos aquí sin condición de salida, algo salió mal
        this.log('⚠️ Unexpected state, breaking loop');
        break;
      }
      
      // Si salimos del loop por max iteraciones
      if (this.state.iterations >= this.config.maxIterations) {
        this.state.status = 'failed';
        return {
          success: false,
          error: `Agent reached maximum iterations (${this.config.maxIterations})`,
        };
      }
      
      this.state.status = 'failed';
      return {
        success: false,
        error: 'Agent completed without producing output',
      };
      
    } catch (error: any) {
      this.state.status = 'failed';
      this.log('❌ Agent error', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Parsear la respuesta de Claude
   */
  private parseResponse(response: Anthropic.Message): {
    stopReason: string;
    contentBlocks: Anthropic.ContentBlock[];
  } {
    return {
      stopReason: response.stop_reason || 'unknown',
      contentBlocks: response.content,
    };
  }
  
  /**
   * Obtener el estado actual del agente
   */
  getState(): AgentState {
    return { ...this.state };
  }
  
  /**
   * Obtener los pasos ejecutados
   */
  getSteps(): AgentStep[] {
    return [...this.state.steps];
  }
  
  /**
   * Reset del agente para nueva ejecución
   */
  reset(): void {
    this.state = {
      status: 'idle',
      currentStep: '',
      steps: [],
      iterations: 0,
      maxIterations: this.config.maxIterations,
    };
  }
}

export default BaseAgent;
