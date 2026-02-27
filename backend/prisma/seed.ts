import { PrismaClient, ProviderType } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PROVIDERS = [
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
        models: [
            { model_id: 'glm-5', display_name: 'GLM-5', context_window: 1000000, max_output_tokens: 4096 },
            { model_id: 'glm-4.7', display_name: 'GLM-4.7', context_window: 200000, max_output_tokens: 4096 },
            { model_id: 'glm-4.7-flash', display_name: 'GLM-4.7 Flash', context_window: 200000, max_output_tokens: 4096 },
            { model_id: 'glm-4-plus', display_name: 'GLM-4 Plus', context_window: 128000, max_output_tokens: 4096 },
            { model_id: 'glm-4-flash', display_name: 'GLM-4 Flash', context_window: 128000, max_output_tokens: 4096 },
        ]
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
                    health_status: 'UNKNOWN'
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
                        input_price_per_1k: 0,
                        output_price_per_1k: 0,
                        enabled: true
                    }
                });
                console.log(`  > Added model: ${m.model_id}`);
            }
        } else {
            console.log(`Provider ${p.display_name} already exists. Skipping.`);

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
                            input_price_per_1k: 0,
                            output_price_per_1k: 0,
                            enabled: true
                        }
                    });
                    console.log(`  > Added missing model: ${m.model_id} to existing provider`);
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
