export namespace main {
	
	export class FetchRequest {
	    url: string;
	    method: string;
	    headers: Record<string, string>;
	    body?: string;
	    stream?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FetchRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.method = source["method"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.stream = source["stream"];
	    }
	}
	export class FetchResponse {
	    status: number;
	    statusText: string;
	    headers: Record<string, string>;
	    body: string;
	    ok: boolean;
	    error?: string;
	    streamId?: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.statusText = source["statusText"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.streamId = source["streamId"];
	    }
	}
	export class MCPMessage {
	    jsonrpc: string;
	    id?: any;
	    method?: string;
	    params?: any;
	    result?: any;
	    error?: any;
	
	    static createFrom(source: any = {}) {
	        return new MCPMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.jsonrpc = source["jsonrpc"];
	        this.id = source["id"];
	        this.method = source["method"];
	        this.params = source["params"];
	        this.result = source["result"];
	        this.error = source["error"];
	    }
	}
	export class MCPRequest {
	    id: string;
	    command: string;
	    args: string[];
	    env: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new MCPRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = source["env"];
	    }
	}

}

