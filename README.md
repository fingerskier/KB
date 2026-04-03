# KB
KnowledgeBase driver

* When running it watches for file changes in it's directory
* When a file changes it chunks amd vector embeds it in FAISS and stores metadata
  * Information Density = gzip-size / orig_size
* Provides a sumple server that
  * gives the vector search tool
  * host a web dashboard
in
