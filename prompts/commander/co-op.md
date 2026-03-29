---
description: "Spawn up to 10 cooperative agents that actively help each other, share discoveries, request assistance, and spawn helpers"
argument-hint: "[task description or 'pending'/'backlog' to process existing tasks]"
allowed-tools: ["Task", "TaskOutput", "mcp__commander__commander_task", "mcp__commander__commander_session", "mcp__commander__commander_mailbox", "mcp__commander__commander_cooperation", "mcp__commander__commander_orchestration", "mcp__commander__commander_dependency", "Bash", "Read", "Edit"]
---

# /co-op — Cooperative Agent Team Mode

Spawn up to **10 cooperative agents** that actively help each other through Commander's cooperation system. Unlike regular teams where agents work in isolation, `/co-op` agents share discoveries, request help when stuck, offer assistance when done early, and can request helper spawns for specialist work.


## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATOR (You)                         │
│              Monitor cooperation, handle spawns              │
└──────────────────────┬──────────────────────────────────────┘
                       │ spawns up to 10
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌───────────┐  ┌───────────┐  ┌───────────┐
  │ co-op-1   │  │ co-op-2   │  │ co-op-N   │
  │           │◄─►│           │◄─►│           │
  │ share     │  │ help      │  │ discover  │
  │ discover  │  │ offer     │  │ spawn     │
  └───────────┘  └───────────┘  └───────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              commander_cooperation
              (shared discoveries,
               help requests, team status)
```

## Step 1: Determine Task Source

Parse `$ARGUMENTS` to determine the work:

**If processing existing tasks** (e.g., "pending", "backlog", "failed"):
```
mcp__commander__commander_task(operation="list", status="pending", limit=20)
```

**If given a new task description**, decompose it into subtasks. Think about:
- What are the independent work streams?
- What dependencies exist?
- What specialist knowledge is needed?
- Aim for 3-10 subtasks that can be parallelized.

## Step 2: Create Task Group

```
mcp__commander__commander_task(
  operation="group:create",
  group_name="co-op: [brief summary]",
  initiative_summary="[1-2 sentence summary of the cooperative effort]",
  total_waves=1,
  working_directory="[current working directory]",
  tasks=[
    {
      "description": "[subtask 1]",
      "task_prompt": "[detailed instructions including cooperative protocol]",
      "dependency_order": 0,
      "context": "[relevant context for this subtask]"
    },
    // ... more tasks
  ]
)
```

## Step 3: Spawn Cooperative Agents (Up to 10)

For each task, spawn a background agent with the **cooperative protocol** baked in.

**IMPORTANT**: Spawn ALL agents in a SINGLE response using multiple Task() calls:

```
Task(
  subagent_type="general-purpose",
  run_in_background=true,
  prompt="You are co-op-agent-1, a COOPERATIVE agent in /co-op team mode.

## Your Task
- Task ID: {task_id}
- Description: {description}
- Working Directory: {working_directory}
- Group ID: {group_id}
- Your Agent Name: co-op-agent-1

## Sibling Tasks (your teammates):
{list of other tasks and their descriptions}

## COOPERATIVE PROTOCOL

### 1. Claim your task
mcp__commander__commander_task(operation='claim', task_id={task_id}, agent_name='co-op-agent-1', model_id='claude-sonnet-4-20250514')

### 2. Check in with team FIRST
mcp__commander__commander_cooperation(operation='team:status', group_id={group_id})
mcp__commander__commander_cooperation(operation='team:discoveries', group_id={group_id})
mcp__commander__commander_mailbox(operation='inbox', agent_name='co-op-agent-1')

### 3. Do your work — and SHARE discoveries as you go
When you find something useful (file locations, API patterns, config, architecture insights):
mcp__commander__commander_cooperation(operation='share:discovery', from_agent='co-op-agent-1', group_id={group_id}, body='...', discovery_type='...', tags=['...'])

### 4. Ask for help if stuck (after 2+ failed attempts)
mcp__commander__commander_cooperation(operation='help:request', from_agent='co-op-agent-1', task_id={task_id}, body='Stuck on: ...', urgency='high')

### 5. When done, check if teammates need help
mcp__commander__commander_cooperation(operation='team:help_needed', group_id={group_id})
If someone needs help, offer:
mcp__commander__commander_cooperation(operation='help:offer', from_agent='co-op-agent-1', to_agent='[stuck agent]', body='I can help with...')

### 6. Complete your task
mcp__commander__commander_task(operation='complete', task_id={task_id}, result='[summary]')

### 7. Send status update
mcp__commander__commander_mailbox(operation='send', from_agent='co-op-agent-1', to_agent='commander', body='Completed: [summary]', message_type='worker_done', task_id={task_id}, group_id={group_id})

### 8. Cleanup
mcp__commander__commander_session(operation='cleanup:self')

## Rules
- ALWAYS check team discoveries before starting work
- Share discoveries IMMEDIATELY — don't hoard knowledge
- Ask for help after 2 failed attempts
- Offer help when you finish early
- Keep status updates concise"
)
```

## Step 4: Monitor Cooperation

While agents work, periodically check:

```
# Team-wide status
mcp__commander__commander_cooperation(operation="team:status", group_id={group_id})

# Any open help requests needing intervention
mcp__commander__commander_cooperation(operation="team:help_needed", group_id={group_id})

# Check agent progress
TaskOutput(task_id="{agent_id}", block=false)
```

### Handle Spawn Requests

If an agent sends a `spawn:request`, create and spawn the helper:

```
# Create helper task
mcp__commander__commander_task(
  operation="create",
  description="[helper task from spawn request]",
  working_directory="[cwd]",
  context="Helper spawned by {requesting_agent}: {reason}"
)

# Spawn helper agent
Task(
  subagent_type="general-purpose",
  run_in_background=true,
  prompt="You are co-op-helper-{N}, spawned to help {requesting_agent}.
  Their request: {spawn_body}
  Group ID: {group_id}
  
  1. Check team discoveries first
  2. Do the requested work
  3. Share your results via share:context
  4. Notify the requesting agent via mailbox
  5. Cleanup your session"
)
```

### Handle Blockers

If a blocker is reported, try to resolve it or escalate to the user.

## Step 5: Report Summary

When all agents complete, report:

```
## /co-op Summary

### Results
- **Tasks**: X completed, Y failed out of Z total
- **Agents**: N cooperative agents spawned
- **Helpers**: M helper agents spawned on-demand

### Cooperation Activity
- **Discoveries shared**: D findings (list highlights)
- **Help interactions**: H (who helped whom)
- **Spawn requests**: S (what specialists were needed)

### Key Discoveries
1. [Most impactful discovery]
2. [Second discovery]
...

### Execution Time
Total: Xm Ys
```

## Notes

- **Maximum 10 agents** at once (configurable)
- You are the **coordinator** — do NOT do the work yourself
- Use `TaskOutput(block=true)` only when all agents are running and you need to wait
- Discoveries persist in the database — future agents can access them
- The cooperation protocol is what makes `/co-op` special — enforce it
