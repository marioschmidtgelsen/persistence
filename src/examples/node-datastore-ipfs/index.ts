import { Author, Book } from "./BooksModel.js"
import { AuthorType, BookType, Repository } from "./BooksTypes.js"
import { createDataStore } from "../../datastore/ipfs/index.js"
import * as assert from "assert"

{
    const datastore = createDataStore(Repository)
    const author = datastore.manager.persist(new Author())
    author.firstname = "Douglas"
    author.lastname = "Adams"
    const book = datastore.manager.persist(new Book())
    book.title = "Hitchhiker's Guide to the Universe"
    book.author = author
    await datastore.manager.flush()
    const key = datastore.manager.cache.key(BookType, book)
    assert.strictEqual(key, "bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y")
}
{
    const datastore = createDataStore(Repository)
    const book = await datastore.manager.find(Book, "bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y")
    assert.strictEqual(book.title, "Hitchhiker's Guide to the Universe")
    assert.ok(book.author)
    assert.strictEqual(book.author?.fullname, "Adams, Douglas")
}