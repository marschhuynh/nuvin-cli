export namespace main {
	
	export class FetchRequest {
	    url: string;
	    method: string;
	    headers: Record<string, string>;
	    body?: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.method = source["method"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	    }
	}
	export class FetchResponse {
	    status: number;
	    statusText: string;
	    headers: Record<string, string>;
	    body: string;
	    ok: boolean;
	    error?: string;
	
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
	    }
	}

}

