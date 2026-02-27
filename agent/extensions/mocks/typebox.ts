// Mock implementation of @sinclair/typebox for testing

export const Type = {
	Object: (schema: any, options?: any) => ({ type: "object", ...schema, ...options }),
	String: (options?: any) => ({ type: "string", ...options }),
	Array: (items: any, options?: any) => ({ type: "array", items, ...options }),
	Optional: (schema: any) => ({ type: "optional", schema }),
};
