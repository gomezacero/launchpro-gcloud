# 🤝 Contributing to LaunchPro

Thank you for your interest in contributing to LaunchPro! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a feature branch** from `main`
4. **Make your changes**
5. **Test thoroughly**
6. **Submit a pull request**

## Development Setup

```bash
cd LaunchPro/launchpro-app/launchpro-app
npm install
npm run setup:env  # Configure environment
npm run prisma:migrate  # Setup database
npm run dev  # Start development server
```

## Project Structure

```
launchpro-app/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── campaigns/         # Campaign pages
│   └── page.tsx           # Home page
├── components/            # React components
├── services/              # Business logic & API services
│   ├── tonic.service.ts
│   ├── meta.service.ts
│   ├── tiktok.service.ts
│   ├── ai.service.ts
│   └── campaign-orchestrator.service.ts
├── lib/                   # Utilities
│   ├── prisma.ts
│   └── env.ts
├── prisma/                # Database schema
└── scripts/               # Utility scripts
```

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new files
- Enable strict mode
- Define proper types and interfaces
- Avoid `any` - use proper typing

### Naming Conventions

- **Files**: `kebab-case.ts` for utilities, `PascalCase.tsx` for components
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (no `I` prefix)

### Comments

- Use JSDoc for public functions
- Add inline comments for complex logic
- Document API parameters and return types

Example:

```typescript
/**
 * Generate AI-powered keywords for a campaign
 * @param params - Parameters for keyword generation
 * @returns Array of generated keywords
 */
async generateKeywords(params: GenerateKeywordsParams): Promise<string[]> {
  // Implementation
}
```

## Adding a New Platform

To add a new advertising platform:

1. **Create service file**: `services/new-platform.service.ts`
2. **Define interfaces** for API parameters
3. **Implement API methods**
4. **Add to database schema**: Update `prisma/schema.prisma`
5. **Update orchestrator**: Add platform logic to `campaign-orchestrator.service.ts`
6. **Create API routes**: Add endpoints in `app/api/`
7. **Update frontend**: Add platform to campaign wizard

Example service structure:

```typescript
class NewPlatformService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.NEW_PLATFORM_API_URL,
      headers: {
        'Authorization': `Bearer ${env.NEW_PLATFORM_TOKEN}`,
      },
    });
  }

  async createCampaign(params: CampaignParams) {
    // Implementation
  }

  // Other methods...
}

export const newPlatformService = new NewPlatformService();
```

## Adding New AI Features

To add new AI-powered features:

1. **Update AI service**: Add method to `services/ai.service.ts`
2. **Define parameters interface**
3. **Create prompt template**
4. **Save to database**: Use `saveAIContent()` method
5. **Integrate into orchestrator**

Example:

```typescript
async generateNewFeature(params: NewFeatureParams): Promise<Result> {
  const systemPrompt = `You are an expert in...`;

  const userPrompt = `Generate ${params.feature} for...`;

  const message = await this.anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Process and save result
  return result;
}
```

## Database Changes

When modifying the database schema:

1. **Edit** `prisma/schema.prisma`
2. **Create migration**: `npm run prisma:migrate`
3. **Update** TypeScript types (auto-generated)
4. **Test** migrations locally
5. **Document** changes in PR

## Testing

### Manual Testing Checklist

- [ ] Campaign creation works end-to-end
- [ ] AI content generation produces valid results
- [ ] Platform API calls succeed
- [ ] Error handling works correctly
- [ ] Database operations complete successfully

### API Testing

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test offers
curl http://localhost:3000/api/offers

# Test campaign creation
curl -X POST http://localhost:3000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Pull Request Process

1. **Update documentation** if needed
2. **Test your changes** thoroughly
3. **Write clear commit messages**
4. **Submit PR** with description
5. **Address review feedback**

### Commit Message Format

```
type(scope): brief description

Detailed explanation of changes...

- List key changes
- Explain why changes were made
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat(ai): add video generation with Veo 3.1
fix(meta): handle expired access tokens
docs(readme): update deployment instructions
```

## Environment Variables

When adding new environment variables:

1. Add to `.env.example` with description
2. Update `lib/env.ts` validation schema
3. Document in `README.md`
4. Update setup script if needed

## Security Guidelines

- **Never commit** secrets or API keys
- **Validate** all user inputs
- **Sanitize** data before database operations
- **Use** parameterized queries (Prisma handles this)
- **Check** for OWASP Top 10 vulnerabilities

## Performance Optimization

- **Use** database indexes for frequently queried fields
- **Implement** caching where appropriate
- **Optimize** API calls (batch when possible)
- **Lazy load** heavy components
- **Profile** performance bottlenecks

## Questions?

- Open an issue for bugs or feature requests
- Reach out to maintainers for questions
- Check existing issues before creating new ones

Thank you for contributing to LaunchPro! 🚀
