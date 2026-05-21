interface StmtResult {
    lastInsertRowid: number | bigint;
    changes: number;
}
interface PreparedStatement {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): StmtResult;
}
interface CompatDb {
    prepare(sql: string): PreparedStatement;
    exec(sql: string): void;
    pragma(pragma: string): void;
    transaction<T>(fn: (arg: T) => void): (arg: T) => void;
}
export declare function getDb(): CompatDb;
export declare function initDb(): Promise<void>;
export declare function isFirstRun(): boolean;
export declare function createAdminUser(username: string, password: string): Promise<void>;
export {};
//# sourceMappingURL=init.d.ts.map