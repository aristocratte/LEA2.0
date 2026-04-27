import { PrismaClient, ProviderType } from '@prisma/client';
import { ZAI_CODING_PLAN_BASE_URL, ZAI_DEFAULT_MODELS, ZAI_DEPRECATED_MODEL_IDS } from '../src/services/ZaiModelCatalog.js';

const prisma = new PrismaClient();
const ZAI_GENERAL_BASE_URL = 'https://api.z.ai/api/paas/v4';

interface SeedModel {
    model_id: string;
    display_name: string;
    context_window: number;
    max_output_tokens: number;
    input_price_per_1k?: number;
    output_price_per_1k?: number;
    supports_streaming?: boolean;
    supports_vision?: boolean;
    supports_tools?: boolean;
}

interface SeedProvider {
    name: string;
    display_name: string;
    type: ProviderType;
    base_url?: string;
    models: SeedModel[];
}

const DEFAULT_PROVIDERS: SeedProvider[] = [
    {
        name: 'anthropic',
        display_name: 'Anthropic',
        type: 'ANTHROPIC' as ProviderType,
        models: [
            { model_id: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus', context_window: 200000, max_output_tokens: 4096 },
            { model_id: 'claude-3-sonnet-20240229', display_name: 'Claude 3 Sonnet', context_window: 200000, max_output_tokens: 4096 },
            { model_id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', context_window: 200000, max_output_tokens: 4096 },
        ]
    },
    {
        name: 'openai',
        display_name: 'OpenAI',
        type: 'OPENAI' as ProviderType,
        models: [
            { model_id: 'gpt-4-turbo', display_name: 'GPT-4 Turbo', context_window: 128000, max_output_tokens: 4096 },
            { model_id: 'gpt-4o', display_name: 'GPT-4o', context_window: 128000, max_output_tokens: 4096 },
            { model_id: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', context_window: 16000, max_output_tokens: 4096 },
        ]
    },
    {
        name: 'zhipu',
        display_name: 'Zhipu AI',
        type: 'ZHIPU' as ProviderType,
        base_url: ZAI_CODING_PLAN_BASE_URL,
        models: ZAI_DEFAULT_MODELS
    },
    {
        name: 'gemini', // Internal ID
        display_name: 'Google Gemini',
        type: 'GEMINI' as ProviderType,
        models: [
            { model_id: 'gemini-3-pro-preview', display_name: 'Gemini 3 Pro (Preview)', context_window: 2000000, max_output_tokens: 8192 },
            { model_id: 'gemini-3-flash-preview', display_name: 'Gemini 3 Flash (Preview)', context_window: 2000000, max_output_tokens: 8192 },
            { model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', context_window: 2000000, max_output_tokens: 8192 },
            { model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', context_window: 1000000, max_output_tokens: 8192 },
            { model_id: 'gemini-2.5-flash-lite', display_name: 'Gemini 2.5 Flash Lite', context_window: 1000000, max_output_tokens: 8192 },
            { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', context_window: 1000000, max_output_tokens: 8192 },
        ]
    }
];

async function main() {
    console.log('Seeding providers...');

    for (const p of DEFAULT_PROVIDERS) {
        const existing = await prisma.provider.findFirst({
            where: {
                OR: [
                    { name: p.name },
                    { type: p.type }
                ]
            }
        });

        if (!existing) {
            console.log(`Creating provider: ${p.display_name}`);
            const provider = await prisma.provider.create({
                data: {
                    name: p.name,
                    display_name: p.display_name,
                    type: p.type,
                    enabled: true,
                    is_default: p.type === 'ANTHROPIC', // Default to Anthropic
                    priority: 1,
                    health_status: 'UNKNOWN',
                    base_url: p.base_url ?? null
                }
            });

            console.log(`  > Created with ID: ${provider.id}`);

            // Create models
            for (const m of p.models) {
                await prisma.modelConfig.create({
                    data: {
                        provider_id: provider.id,
                        model_id: m.model_id,
                        display_name: m.display_name,
                        context_window: m.context_window,
                        max_output_tokens: m.max_output_tokens,
                        input_price_per_1k: m.input_price_per_1k ?? 0,
                        output_price_per_1k: m.output_price_per_1k ?? 0,
                        supports_streaming: m.supports_streaming ?? true,
                        supports_vision: m.supports_vision ?? false,
                        supports_tools: m.supports_tools ?? true,
                        enabled: true
                    }
                });
                console.log(`  > Added model: ${m.model_id}`);
            }
        } else {
            console.log(`Provider ${p.display_name} already exists. Skipping.`);

            if (p.type === 'ZHIPU') {
                if (!existing.base_url || existing.base_url === ZAI_GENERAL_BASE_URL) {
                    await prisma.provider.update({
                        where: { id: existing.id },
                        data: { base_url: ZAI_CODING_PLAN_BASE_URL }
                    });
                    console.log(`  > Set default Z.ai Coding Plan endpoint: ${ZAI_CODING_PLAN_BASE_URL}`);
                }

                const deprecatedResult = await prisma.modelConfig.updateMany({
                    where: {
                        provider_id: existing.id,
                        model_id: { in: [...ZAI_DEPRECATED_MODEL_IDS] }
                    },
                    data: { enabled: false }
                });
                if (deprecatedResult.count > 0) {
                    console.log(`  > Disabled ${deprecatedResult.count} deprecated Z.ai model(s)`);
                }
            }

            // Check if models exist, if not add them
            for (const m of p.models) {
                const existingModel = await prisma.modelConfig.findUnique({
                    where: {
                        provider_id_model_id: {
                            provider_id: existing.id,
                            model_id: m.model_id
                        }
                    }
                });

                if (!existingModel) {
                    await prisma.modelConfig.create({
                        data: {
                            provider_id: existing.id,
                            model_id: m.model_id,
                            display_name: m.display_name,
                            context_window: m.context_window,
                            max_output_tokens: m.max_output_tokens,
                            input_price_per_1k: m.input_price_per_1k ?? 0,
                            output_price_per_1k: m.output_price_per_1k ?? 0,
                            supports_streaming: m.supports_streaming ?? true,
                            supports_vision: m.supports_vision ?? false,
                            supports_tools: m.supports_tools ?? true,
                            enabled: true
                        }
                    });
                    console.log(`  > Added missing model: ${m.model_id} to existing provider`);
                } else {
                    await prisma.modelConfig.update({
                        where: {
                            provider_id_model_id: {
                                provider_id: existing.id,
                                model_id: m.model_id
                            }
                        },
                        data: {
                            display_name: m.display_name,
                            context_window: m.context_window,
                            max_output_tokens: m.max_output_tokens,
                            input_price_per_1k: m.input_price_per_1k ?? 0,
                            output_price_per_1k: m.output_price_per_1k ?? 0,
                            supports_streaming: m.supports_streaming ?? true,
                            supports_vision: m.supports_vision ?? false,
                            supports_tools: m.supports_tools ?? true
                        }
                    });
                    console.log(`  > Updated model metadata: ${m.model_id}`);
                }
            }
        }
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
