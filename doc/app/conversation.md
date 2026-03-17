# Call Workflow Plan for AI Calling Agent

## Overview
This document outlines a modular, granular backend system for managing the AI calling agent's call workflow. The system is designed to be highly adaptable, allowing individual steps to be fused or the entire workflow to be fused and handled by third-party services when appropriate. The primary goal is to enable efficient lead recovery through structured, intelligent conversations.

## Core Principles
- **Granularity**: Each aspect of the call workflow is broken down into discrete, reusable modules.
- **Adaptability**: Steps can be combined, replaced, or handled externally by third-party services.
- **Modularity**: Components are loosely coupled and can be swapped or extended independently.
- **Observability**: Comprehensive logging for continuous improvement and analytics.

## Workflow Modules

### 1. Customer Data Retrieval
**Purpose**: Fetch data for the next scheduled customer from internal CRM.
**Inputs**: Scheduling criteria, CRM API credentials (if external; internal function calls may not require credentials).
**Outputs**: Customer profile data (name, contact info, history).
**Adaptability**: Can be fused with step 2 if CRM provides funnel stage data.

### 2. Customer Context Acquisition
**Purpose**: Determine the customer's current position in the sales funnel.
**Inputs**: Customer ID, funnel definition.
**Outputs**: Funnel stage, progression history.
**Adaptability**: Integrates with CRM data; can be combined with step 1.

### 3. Call Preparation
**Purpose**: Analyze customer journey and prepare conversation strategy.
**Inputs**: Customer data, funnel stage, objection database.
**Outputs**: 
- Processed customer history
- Anticipated objections
- AI agent policies
- Resolution strategies
**Adaptability**: Can incorporate external AI services for objection prediction.

### 4. Call Initiation
**Purpose**: Establish the phone connection using communication services.
**Inputs**: Customer phone number, agent configuration.
**Outputs**: Active call session, connection status.
**Adaptability**: Fully replaceable with third-party services (Twilio, Exotel, etc.).

### 5. Welcome Message Generation
**Purpose**: Deliver initial greeting to customer.
**Inputs**: Customer data, funnel stage, message templates.
**Outputs**: Audio welcome message.
**Adaptability**: 
- Use cached audio library
- Generate fresh via TTS services
- Can be fused with step 4 if service provides welcome handling

### 6. Customer Response Processing
**Purpose**: Handle customer input and generate AI responses.
**Inputs**: Audio input from call.
**Outputs**: Text response converted to speech.
**Process**:
- Speech-to-Text conversion
- NLP processing
- Conversation flow analysis
- LLM response generation
- Text-to-Speech conversion
**Adaptability**: Entire pipeline can be third-party service; can be fused with step 7.

### 7. Conversation Loop Management
**Purpose**: Maintain ongoing dialogue until conclusion.
**Inputs**: Continuous customer responses.
**Outputs**: Continued conversation flow.
**Adaptability**: Can be fused with step 6 as a single conversational service.

### 8. Exception Handling and Steering
**Purpose**: Detect and correct conversation deviations.
**Inputs**: Conversation analysis, deviation thresholds.
**Outputs**: Steering prompts or escalation triggers.
**Adaptability**: Can be integrated into LLM response generation.

### 9. Accomplishment Assessment
**Purpose**: Evaluate progress toward conversation goals.
**Inputs**: Conversation transcript, goal definitions.
**Outputs**: Progress scores, completion indicators.
**Scoring Mechanism**:
- Goal achievement probability
- Rejection indicators
- Conversation momentum metrics
**Adaptability**: Can use external AI services for assessment.

### 10. Conversation Logging and Analytics
**Purpose**: Record interactions for system improvement.
**Inputs**: Full conversation data, outcomes.
**Outputs**: Structured logs, analytics data.
**Uses**:
- Identify new objections
- Predict conversation success probability
- Train improved models
- Persist inbound API calls, telephony webhooks, workflow milestones, and third-party API start/end events in SQLite for durable analytics
**Adaptability**: Can be fused with any step or handled by external logging services.

**Implementation note**: The backend persists call analytics events to a local SQLite database at `backend/data/call-events.sqlite` by default, overridable with `CALL_EVENT_DB_PATH`. Each record includes an event name, category, correlation id, timestamps, request ids, and optional call/session identifiers so webhook receipts and outbound provider calls can be stitched into a single call timeline.

## Adaptability Framework
The system must support dynamic step fusion based on third-party service capabilities:

### Fusion Strategies
- **Service-Level Fusion**: Multiple steps handled by one third-party API
- **Workflow-Level Fusion**: Entire workflow managed externally
- **Hybrid Approach**: Mix of internal modules and external services

### Skippable Steps
Certain steps can be configured as skippable based on business logic, service availability, or optimization needs. When a step is skipped:
- It returns the input data unchanged (pass-through mode)
- Or provides a predefined default output
- This enables composable workflows where steps can be dynamically included or excluded
- Enhances flexibility for different deployment scenarios or third-party integrations

### Implementation Considerations
- **Configuration-Driven**: Service mappings defined in configuration
- **Interface Standardization**: Common interfaces for all modules
- **Fallback Mechanisms**: Graceful degradation when services fail
- **Cost Optimization**: Fuse steps to minimize API calls

## Architecture Components

### Module Interface
Each module should implement a standard interface:
- `execute(context)`: Main execution method; returns processed data or pass-through input if skipped
- `validateInputs()`: Input validation
- `getDependencies()`: Required dependencies
- `isFusable()`: Whether can be combined with others
- `canSkip()`: Whether this step can be skipped in certain configurations

### Workflow Orchestrator
Central component that:
- Manages step execution order
- Handles step fusion based on configuration
- Coordinates data flow between modules
- Manages error handling and retries
- Supports skipping steps with pass-through or default outputs for composability

### Configuration System
Defines:
- Available services and their capabilities
- Fusion rules and mappings
- Fallback strategies
- Performance thresholds

## Next Steps
1. Define detailed interfaces for each module
2. Implement core workflow orchestrator
3. Create configuration schema for adaptability
4. Develop logging and analytics framework
5. Build integration layer for third-party services
6. Implement testing framework for module combinations