import * as Persistence from "../../persistence/index.js"
import * as IPFSHTTPClient from "ipfs-http-client"

export class DataStore implements Persistence.Entity.TransactionFactory {
    readonly manager: Persistence.Entity.Manager
    readonly ipfs: IPFSHTTPClient.IPFSHTTPClient
    constructor(readonly metamodel: Persistence.Meta.Metamodel, readonly options: IPFSHTTPClient.Options = { url: "http://localhost:5001" }) {
        this.manager = new Persistence.Entity.Manager(metamodel, this)
        this.ipfs = IPFSHTTPClient.create(options)
    }
    createTransaction(): Persistence.Entity.Transaction { return new Transaction(this) }
}
class Transaction extends Persistence.Entity.Transaction implements Persistence.Entity.Transaction {
    constructor(readonly datastore: DataStore) { super(datastore.manager) }
    protected createPersister<T extends object>(type: Persistence.Meta.EntityType<T>): Persistence.Entity.Persister<T> { return new Persister(this, type) }
}
class Persister<T extends object> extends Persistence.Entity.Persister<T> implements Persistence.Entity.Persister<T> {
    constructor(readonly transaction: Transaction, readonly type: Persistence.Meta.EntityType<T>) { super(transaction, type) }
    protected async deleteEntity(entity: T, key: any) { throw new Error("Method not implemented.") }
    protected async insertEntity(entity: T) {
        let node = this.createDAGNode(entity)
        let cid = await this.transaction.datastore.ipfs.dag.put(node)
        this.setKey(entity, cid)
        return cid
    }
    protected async updateEntity(entity: T, key: any) { throw new Error("Method not implemented.") }
    private createDAGNode(entity: T) {
        let entries = new Map<string, any>()
        for (const attribute of this.type.attributes) {
            if (attribute.association) {
                let value = Reflect.get(entity, attribute.name) as object
                let key = this.transaction.key(value)
                entries.set(attribute.name, key)
            }
            else {
                let value = Reflect.get(entity, attribute.name)
                entries.set(attribute.name, value)
            }
        }
        return Object.fromEntries(entries)
    }
}