# Running Services Walkthrough

Both the FastAPI backend and Expo Web frontend have been successfully started and verified.

## Running Services

| Component | Port | Local URL | Description | Start Command | Task ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend** | `8000` | [http://127.0.0.1:8000](http://127.0.0.1:8000) | FastAPI server connected to local MongoDB | `$env:MONGO_URL="mongodb://localhost:27017"; python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000` | `task-104` |
| **Frontend** | `8081` | [http://localhost:8081](http://localhost:8081) | Expo Web (Metro Bundler) serving React Native app | `npm run web` | `task-114` |

---

## Verification

### 1. Database Connection & Backend API
- Checked the local MongoDB service and verified it is running as a Windows service (`MongoDB` process: `mongod`).
- Checked the FastAPI API Swagger documentation, which is accessible at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
- Tested an authenticated endpoint `/api/auth/me` and successfully received a `401 Unauthorized ("Not authenticated")` response, confirming that the backend API layer and all middleware are active.

### 2. Frontend Assets & Bundler
- Performed a GET request to `http://localhost:8081` and successfully received the bundled HTML page, confirming that Metro Bundler has fully compiled the web assets.

---

## Logs & Management

### How to Check Logs
You can view the logs for each background task dynamically:
- **Backend Logs**: `C:\Users\USER\.gemini\antigravity-ide\brain\ac84b590-74e1-4777-8d31-3843ed47d579\.system_generated\tasks\task-104.log`
- **Frontend Logs**: `C:\Users\USER\.gemini\antigravity-ide\brain\ac84b590-74e1-4777-8d31-3843ed47d579\.system_generated\tasks\task-114.log`

### How to Kill / Terminate the Running Tasks
If you want to stop the servers in the future, you can ask me to kill them or run:
```powershell
# Stop backend
Stop-Process -Id <process-id-from-logs>
# Stop frontend
Stop-Process -Id <process-id-from-logs>
```
Or you can use `manage_task` with action `kill` and the Task ID.
