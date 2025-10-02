import * as vscode from 'vscode';
import { WebviewPanel } from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Register the command to open the UI
  context.subscriptions.push(
    vscode.commands.registerCommand('autopilot-ui.start', () => {
      AutopilotUI.createOrShow(context);
    })
  );

  // Create the views
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'autopilot.chat',
      new ChatViewProvider(context)
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'autopilot.actions',
      new ActionsViewProvider(context)
    )
  );
}

class AutopilotUI {
  public static currentPanel: AutopilotUI | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AutopilotUI.currentPanel) {
      AutopilotUI.currentPanel._panel.reveal(column);
      return;
    }

    const panel = new AutopilotUI(
      context,
      vscode.window.createWebviewPanel(
        'autopilot',
        'Autopilot',
        column || vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      )
    );
  }

  private constructor(context: vscode.ExtensionContext, panel: WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview();
    
    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'sendMessage':
            // Handle chat message
            break;
          case 'executeAction':
            // Handle action execution
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _getHtmlForWebview() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Autopilot UI</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 0 16px;
          }
          .chat-container {
            display: flex;
            flex-direction: column;
            height: 100%;
          }
          .messages {
            flex: 1;
            overflow-y: auto;
          }
          .input-area {
            display: flex;
            padding: 8px 0;
          }
          #message-input {
            flex: 1;
            padding: 8px;
          }
          button {
            margin-left: 8px;
            padding: 8px 16px;
          }
        </style>
      </head>
      <body>
        <div class="chat-container">
          <div class="messages" id="messages"></div>
          <div class="input-area">
            <input id="message-input" type="text" placeholder="Type your message...">
            <button id="send-button">Send</button>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          
          document.getElementById('send-button').addEventListener('click', () => {
            const input = document.getElementById('message-input');
            vscode.postMessage({
              command: 'sendMessage',
              text: input.value
            });
            input.value = '';
          });
          
          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'addMessage':
                addMessage(message.text, message.isUser);
                break;
            }
          });
          
          function addMessage(text, isUser) {
            const messages = document.getElementById('messages');
            const messageElement = document.createElement('div');
            messageElement.className = isUser ? 'user-message' : 'bot-message';
            messageElement.textContent = text;
            messages.appendChild(messageElement);
            messages.scrollTop = messages.scrollHeight;
          }
        </script>
      </body>
      </html>
    `;
  }

  public dispose() {
    AutopilotUI.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'sendMessage':
          // Handle chat message
          break;
      }
    });
  }

  private _getHtmlForWebview() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat</title>
      </head>
      <body>
        <div id="chat-container">
          <div id="messages"></div>
          <div class="input-area">
            <input id="message-input" type="text" placeholder="Type your message...">
            <button id="send-button">Send</button>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          
          document.getElementById('send-button').addEventListener('click', () => {
            const input = document.getElementById('message-input');
            vscode.postMessage({
              type: 'sendMessage',
              value: input.value
            });
            input.value = '';
          });
        </script>
      </body>
      </html>
    `;
  }
}

class ActionsViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Actions</title>
      </head>
      <body>
        <div id="actions-container">
          <h3>Recent Actions</h3>
          <div id="actions-list"></div>
        </div>
      </body>
      </html>
    `;
  }
}