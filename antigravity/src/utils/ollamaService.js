import { mergeProofreadingResults, proofreadingResultsToXml } from './proofreadingHub.mjs';

export const ollamaService = {
    // Default Ollama URL
    baseUrl: 'http://localhost:11434/api',

    // Check if Ollama is running
    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/tags`);
            return response.ok;
        } catch (error) {
            console.warn("Ollama connection failed:", error);
            return false;
        }
    },

    // Get available models
    async getModels() {
        try {
            const response = await fetch(`${this.baseUrl}/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return (data.models || []).map(m => m.name || m.model);
        } catch (error) {
            console.error("Error fetching models:", error);
            return [];
        }
    },

    // Generate text (Streaming support is better for UX, but starting simple)
    async generateText(prompt, model = 'llama3', onChunk = null) {
        try {
            const response = await fetch(`${this.baseUrl}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: !!onChunk
                })
            });

            if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);

            if (onChunk) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep the last partial line in buffer

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                fullText += json.response;
                                onChunk(json.response);
                            }
                            if (json.done) break;
                        } catch (e) {
                            console.warn("Error parsing chunk:", e);
                        }
                    }
                }
                return fullText;
            } else {
                // Non-streaming
                const data = await response.json();
                return data.response;
            }
        } catch (error) {
            console.error("Text generation failed:", error);
            throw error;
        }
    },

    // Chat completion (better for conversation)
    async chat(messages, model = 'llama3', onChunk = null, signal = null) {
        try {
            const response = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: !!onChunk
                }),
                signal: signal
            });

            if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);

            if (onChunk) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullText = '';

                while (true) {
                    if (signal && signal.aborted) {
                        reader.cancel();
                        break;
                    }
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.message && json.message.content) {
                                fullText += json.message.content;
                                onChunk(json.message.content);
                            }
                            if (json.done) break;
                        } catch (e) {
                            console.warn("Error parsing chunk:", e);
                        }
                    }
                }
                return fullText;
            } else {
                const data = await response.json();
                return data.message.content;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('AI generation aborted by user');
                return null;
            }
            console.error("Chat completion failed:", error);
            throw error;
        }
    },

    // Completion with abort signal (Short generation for Ghost Text)
    async generateCompletion(prompt, model = 'llama3', signal = null, system = '') {
        try {
            const body = {
                model: model,
                prompt: prompt,
                stream: false,
                options: {
                    num_predict: 64, // Limit to short continuation
                    stop: ["\n\n"]   // Stop at paragraph break
                }
            };

            if (system) {
                body.system = system;
            }

            const response = await fetch(`${this.baseUrl}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: signal
            });

            if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);
            const data = await response.json();
            return data.response;
        } catch (error) {
            if (error.name === 'AbortError') {
                return null; // Silent return on abort
            }
            console.error("Completion failed:", error);
            throw error;
        }
    },
    
    // RAG Bridge Server URL
    ragServerUrl: 'http://localhost:8000',

    // Chat with Local RAG (via Python Bridge Server)
    async chatWithRAG(query, model = 'qwen3.5:9b', onChunk = null, signal = null, systemPrompt = '', filePath = '') {
        try {
            const response = await fetch(`${this.ragServerUrl}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    model: model,
                    system_prompt: systemPrompt,
                    file_path: filePath
                }),
                signal: signal
            });

            if (!response.ok) throw new Error(`RAG Bridge Error: ${response.statusText}`);

            if (onChunk) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullText = '';

                while (true) {
                    if (signal && signal.aborted) {
                        reader.cancel();
                        break;
                    }
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.message && json.message.content) {
                                fullText += json.message.content;
                                onChunk(json.message.content);
                            }
                            if (json.done) break;
                        } catch (e) {
                            console.warn("Error parsing RAG chunk:", e);
                        }
                    }
                }
                return fullText;
            } else {
                // Non-streaming (wait for the whole body)
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        const json = JSON.parse(line);
                        fullText += json.message?.content || '';
                    }
                }
                return fullText;
            }
        } catch (error) {
            if (error.name === 'AbortError') return null;
            console.error("RAG chat failed:", error);
            throw error;
        }
    },

    // --- Knowledge Base Management ---

    // Get list of all files in DB
    async listDBItems() {
        try {
            const response = await fetch(`${this.ragServerUrl}/db/items`);
            if (!response.ok) throw new Error('Failed to fetch DB items');
            return await response.json();
        } catch (error) {
            console.error("Error listing DB items:", error);
            return [];
        }
    },

    // Delete a file from DB
    async deleteDBItem(fullPath) {
        try {
            const response = await fetch(`${this.ragServerUrl}/db/items?full_path=${encodeURIComponent(fullPath)}`, {
                method: 'DELETE'
            });
            return response.ok;
        } catch (error) {
            console.error("Error deleting DB item:", error);
            return false;
        }
    },

    // Update tags for a file
    async updateDBItemTags(fullPath, tags) {
        try {
            const response = await fetch(`${this.ragServerUrl}/db/update_tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_path: fullPath, tags: tags })
            });
            return response.ok;
        } catch (error) {
            console.error("Error updating DB tags:", error);
            return false;
        }
    },

    // Suggest tags using AI
    async suggestTags(fullPath, preview) {
        try {
            const response = await fetch(`${this.ragServerUrl}/db/suggest_tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_path: fullPath, preview: preview })
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.tags || [];
        } catch (error) {
            console.error("Error suggesting tags:", error);
            return [];
        }
    },

    // Hybrid Proofread (Rules + AI)
    async proofreadWithRules(text, filePath = "", model = 'qwen3.5:9b') {
        try {
            const response = await fetch(`${this.ragServerUrl}/analyze/proofread`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: text,
                    file_path: filePath,
                    model: model
                })
            });
            if (!response.ok) throw new Error('Proofread endpoint failed');
            const data = await response.json();
            const textlintResults = window.api?.textlint?.proofread
                ? await window.api.textlint.proofread(text, data.profile || {})
                : [];
            const issues = mergeProofreadingResults(text, textlintResults || [], data.issues || []);
            return proofreadingResultsToXml(issues);
        } catch (error) {
            console.error("Hybrid proofread failed:", error);
            throw error;
        }
    },

    // Trigger ingestion script
    async triggerIngest(targetPath = '') {
        try {
            const response = await fetch(`${this.ragServerUrl}/db/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_path: targetPath || null })
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error("Error triggering ingest:", error);
            return null;
        }
    },

    // --- Story Integrity Audit (Batch) ---

    // Start a full batch audit
    async startFullAudit() {
        try {
            const response = await fetch(`${this.ragServerUrl}/analyze/audit/start`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Full audit failed to start');
            return await response.json();
        } catch (error) {
            console.error("Error starting full audit:", error);
            throw error;
        }
    },

    // Retrieve the homework list
    async getAuditReport() {
        try {
            const response = await fetch(`${this.ragServerUrl}/analyze/audit/report`);
            if (!response.ok) throw new Error('Failed to fetch audit report');
            return await response.json();
        } catch (error) {
            console.error("Error fetching audit report:", error);
            return [];
        }
    },

    // Check progress of current audit
    async getAuditStatus() {
        try {
            const response = await fetch(`${this.ragServerUrl}/analyze/audit/status`);
            if (!response.ok) throw new Error('Status check failed');
            return await response.json();
        } catch (error) {
            console.error("Audit status check failed:", error);
            return { running: false, progress: "接続エラー", completed: false };
        }
    }
};
